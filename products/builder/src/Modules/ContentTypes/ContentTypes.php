<?php
/**
 * The site's own kinds of content (docs/factory.md, layer 3): Properties, Courses, Rooms… declared as JSON (the Studio,
 * the AI or the Content types admin page) and registered here as post types, taxonomies and typed post meta.
 *
 * The definition lives in the `auvyx_content_types` option (the `auvyx-content/1` shape of ContentModel.toJson) and every
 * definition and value goes through Model, the PHP mirror of the Studio's ContentModel.scala. Entries are ordinary
 * posts: removing a type from the definition (or the plugin) keeps them in the database.
 *
 * Fields show in Auvyx elements (`auvyx_builder_data_fields`, keys `<type>/<field>`), types are list sources of Posts loops
 * (`content/<type>`), and an entry's page lists its fields after the content when the content does not show them.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\ContentTypes;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class ContentTypes implements Module {

	const OPTION = 'auvyx_content_types';
	/** What the rewrite rules were last flushed for (autoloaded: no query on a normal request). */
	const REWRITE = 'auvyx_content_types_rewrite';
	const SOURCE  = 'content/';

	/** @var array<string, mixed>|null Definition of this request (internal shape). */
	private static $definition;

	/** @var \stdClass|null Marker returned by a meta sanitize callback for a value that must not be stored. */
	private static $invalid;

	/** @var \stdClass|null Marker for an empty value (the meta is deleted). */
	private static $empty;

	public function id(): string {
		return 'content-types';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_types' ), 5 );
		add_action( 'init', array( $this, 'flush_rewrites' ), 99 );
		add_filter( 'update_post_metadata', array( $this, 'short_circuit_meta' ), 10, 4 );
		add_filter( 'add_post_metadata', array( $this, 'short_circuit_meta' ), 10, 4 );
		add_filter( 'auvyx_builder_data_fields', array( $this, 'data_fields' ) );
		add_filter( 'auvyx_builder_loop_sources', array( $this, 'loop_sources' ) );
		add_filter( 'auvyx_builder_loop_query_args', array( $this, 'loop_query_args' ), 10, 2 );
		add_filter( 'the_content', array( $this, 'append_fields' ), 20 );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_front' ) );
		( new Rest() )->register();
		( new Admin() )->register();
	}

	/** Whether the Studio offers content types (it reads entries; saving the definition is checked again). */
	public static function can(): bool {
		return current_user_can( 'edit_posts' );
	}

	// ---- the definition ----------------------------------------------------------------------------

	/**
	 * The site's definition (internal shape: see Model::validate). Empty when none or when the stored one is refused.
	 *
	 * @return array{types: array<int, array<string, mixed>>, taxonomies: array<int, array<string, mixed>>}
	 */
	public static function definition(): array {
		if ( null === self::$definition ) {
			$stored           = get_option( self::OPTION, array() );
			$result           = Model::validate( is_array( $stored ) && array() !== $stored ? $stored : array( 'types' => array() ) );
			self::$definition = null !== $result['definition'] ? $result['definition'] : array(
				'types'      => array(),
				'taxonomies' => array(),
			);
		}
		return self::$definition;
	}

	/**
	 * Checks and keeps a definition (decoded JSON). Registration follows on the next request (or `register_types()`).
	 *
	 * @param mixed $json Decoded JSON.
	 * @return array{errors: array<int, string>, definition: array<string, mixed>|null}
	 */
	public static function save( $json ): array {
		$result = Model::validate( $json );
		if ( null !== $result['definition'] ) {
			update_option( self::OPTION, Model::to_json( $result['definition'] ), true );
			self::$definition = $result['definition'];
		}
		return $result;
	}

	/**
	 * A type of the definition by key.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function type( string $key ): ?array {
		foreach ( self::definition()['types'] as $type ) {
			if ( $type['key'] === $key ) {
				return $type;
			}
		}
		return null;
	}

	/**
	 * A field of a type by key.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function field( string $type, string $key ): ?array {
		$t = self::type( $type );
		foreach ( $t ? $t['fields'] : array() as $field ) {
			if ( $field['key'] === $key ) {
				return $field;
			}
		}
		return null;
	}

	/**
	 * Taxonomies of the definition on a type.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function taxonomies_of( string $type ): array {
		return array_values( array_filter( self::definition()['taxonomies'], static fn( $t ) => in_array( $type, $t['types'], true ) ) );
	}

	// ---- registration --------------------------------------------------------------------------------

	public function register_types(): void {
		self::$definition = null;
		$definition       = self::definition();
		foreach ( $definition['types'] as $type ) {
			register_post_type( $type['key'], self::post_type_args( $type ) );
			foreach ( $type['fields'] as $field ) {
				register_post_meta(
					$type['key'],
					$field['key'],
					array(
						'type'              => self::meta_type( $field ),
						'single'            => true,
						'show_in_rest'      => array( 'schema' => self::schema( $field ) ),
						'sanitize_callback' => array( $this, 'sanitize_meta' ),
						'auth_callback'     => array( $this, 'auth_meta' ),
					)
				);
			}
		}
		foreach ( $definition['taxonomies'] as $taxonomy ) {
			register_taxonomy(
				$taxonomy['key'],
				$taxonomy['types'],
				array(
					'labels'            => array(
						'name'          => $taxonomy['label'],
						'singular_name' => $taxonomy['singular'],
						'menu_name'     => $taxonomy['label'],
						/* translators: %s: taxonomy name (singular) */
						'add_new_item'  => sprintf( __( 'Add %s', 'auvyx-builder' ), $taxonomy['singular'] ),
						/* translators: %s: taxonomy name (singular) */
						'edit_item'     => sprintf( __( 'Edit %s', 'auvyx-builder' ), $taxonomy['singular'] ),
					),
					'public'            => true,
					'hierarchical'      => $taxonomy['hierarchical'],
					'show_in_rest'      => true,
					'show_admin_column' => true,
					'rewrite'           => array(
						'slug'       => $taxonomy['slug'],
						'with_front' => false,
					),
				)
			);
			foreach ( $taxonomy['types'] as $object_type ) {
				register_taxonomy_for_object_type( $taxonomy['key'], $object_type );
			}
		}
	}

	/**
	 * @param array<string, mixed> $type Type.
	 * @return array<string, mixed>
	 */
	private static function post_type_args( array $type ): array {
		$singular = (string) $type['singular'];
		$public   = (bool) $type['public'];
		$supports = array_values( array_merge( $type['supports'], array( 'custom-fields' ) ) );
		return array(
			'labels'              => array(
				'name'               => $type['label'],
				'singular_name'      => $singular,
				'menu_name'          => $type['label'],
				'all_items'          => $type['label'],
				/* translators: %s: content type name (singular) */
				'add_new_item'       => sprintf( __( 'Add %s', 'auvyx-builder' ), $singular ),
				/* translators: %s: content type name (singular) */
				'edit_item'          => sprintf( __( 'Edit %s', 'auvyx-builder' ), $singular ),
				/* translators: %s: content type name (singular) */
				'new_item'           => sprintf( __( 'New %s', 'auvyx-builder' ), $singular ),
				/* translators: %s: content type name (singular) */
				'view_item'          => sprintf( __( 'View %s', 'auvyx-builder' ), $singular ),
				/* translators: %s: content type name (plural) */
				'search_items'       => sprintf( __( 'Search %s', 'auvyx-builder' ), $type['label'] ),
				'not_found'          => __( 'Nothing found.', 'auvyx-builder' ),
				'not_found_in_trash' => __( 'Nothing found in the trash.', 'auvyx-builder' ),
			),
			'public'              => $public,
			'publicly_queryable'  => $public,
			'exclude_from_search' => ! $public,
			'show_in_nav_menus'   => $public,
			'show_ui'             => true,
			'show_in_menu'        => true,
			'show_in_rest'        => true,
			'has_archive'         => $public && $type['archive'] ? $type['slug'] : false,
			'rewrite'             => $public ? array(
				'slug'       => $type['slug'],
				'with_front' => false,
			) : false,
			'query_var'           => $public,
			'supports'            => $supports,
			'menu_icon'           => self::menu_icon( (string) $type['icon'] ),
			'menu_position'       => 25,
			'capability_type'     => 'post',
			'map_meta_cap'        => true,
		);
	}

	/** A dashicon for a type's icon name (the Studio's icon names, or a dashicon name). */
	public static function menu_icon( string $icon ): string {
		$map = array(
			'home'           => 'admin-home',
			'house'          => 'admin-home',
			'building'       => 'building',
			'book'           => 'book',
			'book-open'      => 'book-alt',
			'calendar'       => 'calendar-alt',
			'event'          => 'calendar-alt',
			'user'           => 'admin-users',
			'users'          => 'groups',
			'team'           => 'groups',
			'cart'           => 'cart',
			'shop'           => 'store',
			'store'          => 'store',
			'star'           => 'star-filled',
			'heart'          => 'heart',
			'map'            => 'location-alt',
			'map-pin'        => 'location',
			'pin'            => 'location',
			'image'          => 'format-image',
			'camera'         => 'camera',
			'video'          => 'video-alt3',
			'music'          => 'format-audio',
			'car'            => 'car',
			'food'           => 'food',
			'utensils'       => 'food',
			'briefcase'      => 'portfolio',
			'job'            => 'portfolio',
			'award'          => 'awards',
			'school'         => 'welcome-learn-more',
			'graduation-cap' => 'welcome-learn-more',
			'tag'            => 'tag',
			'quote'          => 'format-quote',
			'chat'           => 'format-chat',
			'bed'            => 'admin-multisite',
			'globe'          => 'admin-site-alt3',
			'tool'           => 'admin-tools',
			'file'           => 'media-document',
			'list'           => 'list-view',
			'chart'          => 'chart-bar',
		);
		if ( 0 === strpos( $icon, 'dashicons-' ) ) {
			return $icon;
		}
		return isset( $map[ $icon ] ) ? 'dashicons-' . $map[ $icon ] : 'dashicons-database';
	}

	/**
	 * The meta type WordPress keeps for a field.
	 *
	 * @param array<string, mixed> $field Field.
	 */
	private static function meta_type( array $field ): string {
		switch ( $field['kind'] ) {
			case 'number':
			case 'money':
				return 'number';
			case 'checkbox':
				return 'boolean';
			case 'image':
			case 'file':
				return 'integer';
			case 'relation':
			case 'select':
				return $field['multiple'] ? 'array' : ( 'relation' === $field['kind'] ? 'integer' : 'string' );
			case 'gallery':
			case 'repeater':
				return 'array';
		}
		return 'string';
	}

	/**
	 * The REST schema of a field's value.
	 *
	 * @param array<string, mixed> $field Field.
	 * @return array<string, mixed>
	 */
	private static function schema( array $field ): array {
		$type = self::meta_type( $field );
		switch ( $field['kind'] ) {
			case 'select':
				return $field['multiple'] ? array(
					'type'  => 'array',
					'items' => array(
						'type' => 'string',
						'enum' => $field['options'],
					),
				) : array( 'type' => 'string' );
			case 'gallery':
			case 'relation':
				return 'array' === $type ? array(
					'type'  => 'array',
					'items' => array( 'type' => 'integer' ),
				) : array( 'type' => 'integer' );
			case 'repeater':
				$properties = array();
				foreach ( $field['fields'] as $sub ) {
					$properties[ $sub['key'] ] = self::schema( $sub );
				}
				return array(
					'type'  => 'array',
					'items' => array(
						'type'                 => 'object',
						'properties'           => $properties,
						'additionalProperties' => false,
					),
				);
		}
		return array( 'type' => $type );
	}

	/**
	 * Flushes the rewrite rules once after the types or taxonomies (their addresses) change, never on every load.
	 */
	public function flush_rewrites(): void {
		$definition = self::definition();
		$key        = md5( (string) wp_json_encode( array( array_map( static fn( $t ) => array( $t['key'], $t['slug'], $t['public'], $t['archive'] ), $definition['types'] ), array_map( static fn( $t ) => array( $t['key'], $t['slug'] ), $definition['taxonomies'] ) ) ) );
		if ( get_option( self::REWRITE ) !== $key ) {
			update_option( self::REWRITE, $key, true );
			flush_rewrite_rules( false );
		}
	}

	// ---- values in post meta ------------------------------------------------------------------------

	/**
	 * Sanitizes a value WordPress is about to keep (REST, update_post_meta): the mirrored rules. A refused value is not
	 * stored (the previous one stays); an empty one deletes the meta.
	 *
	 * @param mixed  $value       Value.
	 * @param string $meta_key    Field key.
	 * @param string $object_type 'post'.
	 * @param string $subtype     Post type.
	 * @return mixed
	 */
	public function sanitize_meta( $value, $meta_key = '', $object_type = 'post', $subtype = '' ) {
		$field = self::field( (string) $subtype, (string) $meta_key );
		if ( null === $field ) {
			return $value;
		}
		$result = Model::sanitize( $field, $value );
		if ( ! $result['ok'] ) {
			return self::marker( 'invalid' );
		}
		if ( null === $result['value'] ) {
			return self::marker( 'empty' );
		}
		return self::to_storage( $field, $result['value'] );
	}

	/**
	 * @param string $which 'invalid' or 'empty'.
	 */
	private static function marker( string $which ): \stdClass {
		if ( null === self::$invalid ) {
			self::$invalid = new \stdClass();
			self::$empty   = new \stdClass();
		}
		return 'invalid' === $which ? self::$invalid : self::$empty;
	}

	/**
	 * Stops a refused value (and deletes the meta for an empty one) after sanitize_meta.
	 *
	 * @param mixed  $check     Short circuit.
	 * @param int    $object_id Post.
	 * @param string $meta_key  Key.
	 * @param mixed  $value     Sanitized value.
	 * @return mixed
	 */
	public function short_circuit_meta( $check, $object_id, $meta_key, $value ) {
		if ( null === self::$invalid || ! is_object( $value ) ) {
			return $check;
		}
		if ( $value === self::$invalid ) {
			return false;
		}
		if ( $value === self::$empty ) {
			delete_post_meta( (int) $object_id, (string) $meta_key );
			return true;
		}
		return $check;
	}

	/**
	 * Who may change a field: whoever may edit the entry.
	 *
	 * @param bool   $allowed  Allowed so far.
	 * @param string $meta_key Key.
	 * @param int    $post_id  Post.
	 */
	public function auth_meta( $allowed, $meta_key = '', $post_id = 0 ): bool {
		return current_user_can( 'edit_post', (int) $post_id );
	}

	/**
	 * A kept value as post meta holds it: Yes/no as '1'/'0' (WordPress keeps false as an empty string).
	 *
	 * @param array<string, mixed> $field Field.
	 * @param mixed                $value Kept value.
	 * @return mixed
	 */
	private static function to_storage( array $field, $value ) {
		if ( 'checkbox' === $field['kind'] ) {
			return $value ? '1' : '0';
		}
		if ( 'repeater' === $field['kind'] && is_array( $value ) ) {
			foreach ( $value as $i => $row ) {
				foreach ( $field['fields'] as $sub ) {
					if ( 'checkbox' === $sub['kind'] && isset( $row[ $sub['key'] ] ) ) {
						$value[ $i ][ $sub['key'] ] = $row[ $sub['key'] ] ? '1' : '0';
					}
				}
			}
		}
		return $value;
	}

	/**
	 * An entry's value of a field, typed (as Model keeps it), or null.
	 *
	 * @param array<string, mixed> $field Field.
	 * @return mixed
	 */
	public static function value( int $post_id, array $field ) {
		if ( ! metadata_exists( 'post', $post_id, $field['key'] ) ) {
			return null;
		}
		$raw    = get_post_meta( $post_id, $field['key'], true );
		$result = Model::sanitize( array( 'required' => false ) + $field, $raw );
		return $result['ok'] ? $result['value'] : null;
	}

	/**
	 * Values of every field of an entry (only those it has).
	 *
	 * @param array<string, mixed> $type Type.
	 * @return array<string, mixed>
	 */
	public static function values( int $post_id, array $type ): array {
		$out = array();
		foreach ( $type['fields'] as $field ) {
			$value = self::value( $post_id, $field );
			if ( null !== $value ) {
				$out[ $field['key'] ] = $value;
			}
		}
		return $out;
	}

	/**
	 * Keeps sanitized values (Model::sanitize_all): null deletes.
	 *
	 * @param array<string, mixed> $type   Type.
	 * @param array<string, mixed> $values Kept values by key.
	 */
	public static function store( int $post_id, array $type, array $values ): void {
		foreach ( $type['fields'] as $field ) {
			if ( ! array_key_exists( $field['key'], $values ) ) {
				continue;
			}
			if ( null === $values[ $field['key'] ] ) {
				delete_post_meta( $post_id, $field['key'] );
			} else {
				update_post_meta( $post_id, $field['key'], wp_slash( $values[ $field['key'] ] ) );
			}
		}
	}

	// ---- Auvyx data ----------------------------------------------------------------------------------

	/**
	 * A field's text for a page: pictures and files as addresses, linked entries as their titles, the rest as Model shows.
	 *
	 * @param array<string, mixed> $field Field.
	 */
	public static function text( \WP_Post $post, array $field ): string {
		$value = self::value( $post->ID, $field );
		if ( null === $value ) {
			return '';
		}
		switch ( $field['kind'] ) {
			case 'image':
				return (string) wp_get_attachment_image_url( (int) $value, 'large' );
			case 'gallery':
				return isset( $value[0] ) ? (string) wp_get_attachment_image_url( (int) $value[0], 'large' ) : '';
			case 'file':
				return (string) wp_get_attachment_url( (int) $value );
			case 'relation':
				return implode( ', ', array_map( static fn( $p ) => wp_strip_all_tags( html_entity_decode( get_the_title( $p ), ENT_QUOTES, 'UTF-8' ) ), self::linked( (array) $value ) ) );
		}
		return Model::display( $field, $value );
	}

	/**
	 * Linked entries a visitor may see.
	 *
	 * @param array<int, int> $ids Ids.
	 * @return \WP_Post[]
	 */
	private static function linked( array $ids ): array {
		$out = array();
		foreach ( $ids as $id ) {
			$post = get_post( (int) $id );
			if ( $post && ( is_post_publicly_viewable( $post ) || current_user_can( 'read_post', $post->ID ) ) ) {
				$out[] = $post;
			}
		}
		return $out;
	}

	/**
	 * Every field of every type as an Auvyx data field (`<type>/<field>`), grouped by type.
	 *
	 * @param array<string, mixed> $fields Fields so far.
	 * @return array<string, mixed>
	 */
	public function data_fields( $fields ): array {
		$fields = (array) $fields;
		foreach ( self::definition()['types'] as $type ) {
			foreach ( $type['fields'] as $field ) {
				$shape = 'image' === $field['kind'] || 'gallery' === $field['kind'] ? 'image' : ( 'url' === $field['kind'] || 'file' === $field['kind'] ? 'url' : 'text' );
				$key   = $type['key'];
				$def   = $field;
				$fields[ Model::binding_key( $type, $field ) ] = array(
					'label' => $field['label'],
					'group' => $type['label'],
					'shape' => $shape,
					'value' => static function ( $post ) use ( $key, $def ): string {
						return $post instanceof \WP_Post && $key === $post->post_type ? self::text( $post, $def ) : '';
					},
				);
			}
		}
		return $fields;
	}

	/**
	 * Every public type as a list source of Posts loops: `content/<type>`.
	 *
	 * @param array<string, mixed> $sources Sources so far.
	 * @return array<string, mixed>
	 */
	public function loop_sources( $sources ): array {
		$sources = (array) $sources;
		foreach ( self::definition()['types'] as $type ) {
			if ( $type['public'] ) {
				$sources[ self::SOURCE . $type['key'] ] = array(
					'label'    => $type['label'],
					'postType' => $type['key'],
				);
			}
		}
		return $sources;
	}

	/**
	 * A loop over `content/<type>` lists that type's published entries.
	 *
	 * @param array<string, mixed> $args   WP_Query args.
	 * @param string               $source Source.
	 * @return array<string, mixed>
	 */
	public function loop_query_args( $args, $source = '' ): array {
		$args   = (array) $args;
		$source = (string) $source;
		if ( 0 === strpos( $source, self::SOURCE ) ) {
			$type = self::type( substr( $source, strlen( self::SOURCE ) ) );
			if ( $type && $type['public'] && post_type_exists( $type['key'] ) ) {
				$args['post_type']   = $type['key'];
				$args['post_status'] = 'publish';
			}
		}
		return $args;
	}

	// ---- an entry's page --------------------------------------------------------------------------

	/** The entry shown on this singular view, when it is one of ours and its fields are not already in its content. */
	private static function shown_entry(): ?\WP_Post {
		// Not inside an automatic excerpt (wp_trim_excerpt runs the_content too).
		if ( ! is_singular() || ! in_the_loop() || ! is_main_query() || doing_filter( 'get_the_excerpt' ) ) {
			return null;
		}
		$post = get_post();
		if ( ! $post || null === self::type( $post->post_type ) || (int) get_queried_object_id() !== $post->ID ) {
			return null;
		}
		return $post;
	}

	/**
	 * After an entry's content: its fields as a list of terms and values, unless the content shows them already (a
	 * `auvyx/data` binding to one of the type's fields) or `auvyx_content_types_show_fields` says no.
	 *
	 * @param string $content Content.
	 */
	public function append_fields( $content ): string {
		$content = (string) $content;
		$post    = self::shown_entry();
		if ( ! $post ) {
			return $content;
		}
		$type = self::type( $post->post_type );
		/**
		 * Filters whether an entry's page lists its fields after the content.
		 *
		 * @param bool     $show Show them.
		 * @param \WP_Post $post The entry.
		 */
		$show = apply_filters( 'auvyx_content_types_show_fields', ! self::content_binds( (string) $post->post_content, $type ), $post ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- the documented name (auvyx_ prefix).
		if ( ! $show ) {
			return $content;
		}
		return $content . self::fields_html( $post, $type );
	}

	/**
	 * Whether content binds one of a type's fields.
	 *
	 * @param array<string, mixed> $type Type.
	 */
	public static function content_binds( string $content, array $type ): bool {
		foreach ( $type['fields'] as $field ) {
			$key = Model::binding_key( $type, $field );
			if ( false !== strpos( $content, '"key":"' . $key . '"' ) || false !== strpos( $content, '"key":"' . str_replace( '/', '\\/', $key ) . '"' ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * An entry's fields as `<dl class="auvyx-fields">` (empty fields left out; nothing when all are empty).
	 *
	 * @param array<string, mixed> $type Type.
	 */
	public static function fields_html( \WP_Post $post, array $type ): string {
		$rows = '';
		foreach ( $type['fields'] as $field ) {
			$value = self::value( $post->ID, $field );
			$html  = null === $value ? '' : self::value_html( $field, $value );
			if ( '' !== $html ) {
				$rows .= '<div class="auvyx-fields__item auvyx-fields__item--' . esc_attr( $field['kind'] ) . '"><dt>' . esc_html( $field['label'] ) . '</dt><dd>' . $html . '</dd></div>';
			}
		}
		return '' === $rows ? '' : '<dl class="auvyx-fields">' . $rows . '</dl>';
	}

	/**
	 * One value as HTML (escaped).
	 *
	 * @param array<string, mixed> $field Field.
	 * @param mixed                $value Kept value.
	 */
	private static function value_html( array $field, $value ): string {
		switch ( $field['kind'] ) {
			case 'image':
				return (string) wp_get_attachment_image( (int) $value, 'large', false, array( 'class' => 'auvyx-fields__image' ) );
			case 'gallery':
				$items = '';
				foreach ( (array) $value as $id ) {
					$img = (string) wp_get_attachment_image( (int) $id, 'medium', false, array( 'loading' => 'lazy' ) );
					if ( '' !== $img ) {
						$url    = (string) wp_get_attachment_image_url( (int) $id, 'large' );
						$items .= '<li>' . ( '' !== $url ? '<a href="' . esc_url( $url ) . '">' . $img . '</a>' : $img ) . '</li>';
					}
				}
				return '' === $items ? '' : '<ul class="auvyx-fields__gallery">' . $items . '</ul>';
			case 'file':
				$url = (string) wp_get_attachment_url( (int) $value );
				return '' === $url ? '' : '<a class="auvyx-fields__file" href="' . esc_url( $url ) . '" download>' . esc_html( wp_basename( (string) get_attached_file( (int) $value ) ) ) . '</a>';
			case 'relation':
				$links = array_map( static fn( $p ) => '<a href="' . esc_url( (string) get_permalink( $p ) ) . '">' . esc_html( wp_strip_all_tags( get_the_title( $p ) ) ) . '</a>', self::linked( (array) $value ) );
				return implode( ', ', $links );
			case 'url':
				return '<a href="' . esc_url( (string) $value ) . '">' . esc_html( (string) $value ) . '</a>';
			case 'email':
				return '<a href="' . esc_url( 'mailto:' . $value ) . '">' . esc_html( (string) $value ) . '</a>';
			case 'phone':
				return '<a href="' . esc_url( 'tel:' . preg_replace( '/[^0-9+]/', '', (string) $value ) ) . '">' . esc_html( (string) $value ) . '</a>';
			case 'color':
				return '<span class="auvyx-fields__swatch" style="background-color:' . esc_attr( (string) $value ) . '"></span> ' . esc_html( (string) $value );
			case 'textarea':
				return nl2br( esc_html( (string) $value ) );
			case 'checkbox':
				return esc_html( $value ? __( 'Yes', 'auvyx-builder' ) : __( 'No', 'auvyx-builder' ) );
			case 'repeater':
				$head = '';
				foreach ( $field['fields'] as $sub ) {
					$head .= '<th scope="col">' . esc_html( $sub['label'] ) . '</th>';
				}
				$body = '';
				foreach ( (array) $value as $row ) {
					$body .= '<tr>';
					foreach ( $field['fields'] as $sub ) {
						$body .= '<td>' . ( isset( $row[ $sub['key'] ] ) ? self::value_html( $sub, $row[ $sub['key'] ] ) : '' ) . '</td>';
					}
					$body .= '</tr>';
				}
				return '<table class="auvyx-fields__rows"><thead><tr>' . $head . '</tr></thead><tbody>' . $body . '</tbody></table>';
		}
		return esc_html( Model::display( $field, $value ) );
	}

	/** The fields' small stylesheet, only on an entry's page. */
	public function enqueue_front(): void {
		if ( ! is_singular() || null === self::type( (string) get_post_type() ) ) {
			return;
		}
		wp_register_style( 'auvyx-content-fields', false, array(), AUVYX_BUILDER_VERSION );
		wp_enqueue_style( 'auvyx-content-fields' );
		wp_add_inline_style(
			'auvyx-content-fields',
			'.auvyx-fields{display:grid;grid-template-columns:minmax(8rem,max-content) 1fr;gap:var(--wp--preset--spacing--20,.5rem) var(--wp--preset--spacing--40,1.5rem);margin:var(--wp--preset--spacing--50,2rem) 0 0;padding:var(--wp--preset--spacing--40,1.5rem) 0 0;border-top:1px solid var(--wp--preset--color--contrast-3,currentColor)}'
			. '.auvyx-fields__item{display:contents}.auvyx-fields dt{font-weight:600;color:var(--wp--preset--color--contrast,inherit)}.auvyx-fields dd{margin:0;min-width:0}'
			. '.auvyx-fields__image{max-width:100%;height:auto;border-radius:var(--wp--custom--radius--md,6px)}'
			. '.auvyx-fields__gallery{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(7rem,1fr));gap:var(--wp--preset--spacing--20,.5rem)}.auvyx-fields__gallery img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:var(--wp--custom--radius--sm,4px)}'
			. '.auvyx-fields__rows{border-collapse:collapse;width:100%}.auvyx-fields__rows th,.auvyx-fields__rows td{text-align:left;padding:.25rem .5rem;border-bottom:1px solid var(--wp--preset--color--contrast-3,rgba(0,0,0,.15))}'
			. '.auvyx-fields__swatch{display:inline-block;width:1em;height:1em;vertical-align:-.15em;border-radius:50%;border:1px solid rgba(0,0,0,.2)}'
			. '@media (max-width:600px){.auvyx-fields{grid-template-columns:1fr}.auvyx-fields dd{margin-bottom:var(--wp--preset--spacing--20,.5rem)}}'
		);
	}
}
