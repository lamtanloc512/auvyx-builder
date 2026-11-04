<?php
/**
 * WordPress data in Auvyx elements (ADR 0027). An Auvyx heading, text, button or image can show a field of the current post
 * (or of each post in a Posts loop), of the site, or a custom field, instead of static content. The binding is saved
 * the WordPress way, as `metadata.bindings` with the `auvyx/data` source, and applied here at render time for every WP
 * version this plugin supports (core only applies bindings to its own blocks before 6.9).
 *
 * Keys: same list as apps/studio/packages/shared/.../DataFields.scala. Plugins add fields (`auvyx_builder_data_fields`,
 * namespaced keys such as `woo/stock`) and loop sources (`auvyx_builder_loop_sources`, `auvyx_builder_loop_query_args`):
 * ADR 0036.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Data;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\DataSources\DataSources;

defined( 'ABSPATH' ) || exit;

final class Data implements Module {

	const SOURCE = 'auvyx/data';

	/** Bindable attributes per block. */
	const BINDABLE = array(
		'auvyx/heading' => array( 'content', 'href' ),
		'auvyx/text'    => array( 'content' ),
		'auvyx/button'  => array( 'text', 'url' ),
		'auvyx/image'   => array( 'url', 'alt', 'href' ),
	);

	/** Keys of fields added by plugins: `namespace/name`. */
	const EXTENSION_KEY = '/^[a-z0-9-]{1,30}\/[a-z0-9_]{1,60}$/';

	const SHAPES = array( 'text', 'url', 'image' );

	/** Post meta: a picture's address for a post without a media file (a site template's sample posts). */
	const IMAGE = 'auvyx_image';

	const FIELDS = array(
		'post_title',
		'post_excerpt',
		'post_date',
		'post_author',
		'post_categories',
		'post_url',
		'featured_image',
		'featured_image_alt',
		'site_title',
		'site_tagline',
		'site_url',
		'site_logo',
		'archive_title',
		'product_price',
		'product_sku',
		'product_add_to_cart_url',
		'product_add_to_cart_text',
	);

	public function id(): string {
		return 'data';
	}

	public function requires(): array {
		return array( 'wp' => '6.5' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_source' ) );
		add_action( 'init', array( $this, 'register_image_meta' ) );
		foreach ( array_keys( self::BINDABLE ) as $name ) {
			// After auvyx/image's srcset filter (10), so a bound image replaces it.
			add_filter( 'render_block_' . $name, array( $this, 'apply' ), 20, 3 );
		}
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	/** The source shows up for other tools (and core blocks can use it too). */
	public function register_image_meta(): void {
		register_post_meta(
			'post',
			self::IMAGE,
			array(
				'type'              => 'string',
				'single'            => true,
				'default'           => '',
				'show_in_rest'      => true,
				'sanitize_callback' => static fn( $value ) => esc_url_raw( (string) $value, array( 'http', 'https' ) ),
				'auth_callback'     => static fn( $allowed, $meta_key, $post_id ) => current_user_can( 'edit_post', (int) $post_id ),
			)
		);
	}

	/**
	 * The taxonomy a post type's "Categories" field shows: categories for posts, product categories for products, else the
	 * type's first public taxonomy, hierarchical ones first (a site's own content types: a property's district).
	 */
	private static function category_taxonomy( string $post_type ): string {
		if ( 'post' === $post_type ) {
			return 'category';
		}
		if ( 'product' === $post_type ) {
			return 'product_cat';
		}
		$public = array_filter( get_object_taxonomies( $post_type, 'objects' ), static fn( $t ) => $t->public );
		usort( $public, static fn( $a, $b ) => (int) $b->hierarchical - (int) $a->hierarchical );
		return $public ? $public[0]->name : 'category';
	}

	/** A post's picture: its featured image, else the picture it was made with (auvyx_image). */
	private static function image_url( \WP_Post $post ): string {
		$url = (string) get_the_post_thumbnail_url( $post, 'large' );
		$url = '' !== $url ? $url : (string) get_post_meta( $post->ID, self::IMAGE, true );
		// A product without a photo shows WooCommerce's placeholder, as every shop page does: a card never loses its photo.
		if ( '' === $url && 'product' === $post->post_type && function_exists( 'wc_placeholder_img_src' ) ) {
			$url = (string) wc_placeholder_img_src( 'woocommerce_thumbnail' );
		}
		return $url;
	}

	public function register_source(): void {
		if ( function_exists( 'register_block_bindings_source' ) && function_exists( 'get_block_bindings_source' ) && null === get_block_bindings_source( self::SOURCE ) ) {
			register_block_bindings_source(
				self::SOURCE,
				array(
					'label'              => __( 'Auvyx data', 'auvyx-builder' ),
					'get_value_callback' => static function ( array $args, $block ) {
						$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : (int) get_the_ID();
						return self::value( (string) ( $args['key'] ?? '' ), $post_id );
					},
					'uses_context'       => array( 'postId', 'postType' ),
				)
			);
		}
	}

	// ---- values ----------------------------------------------------------------------------

	/** A custom field key in the right shape: not protected (no leading underscore), simple characters. */
	public static function meta_key( string $key ): string {
		return preg_match( '/^[A-Za-z0-9][A-Za-z0-9_\-]{0,99}$/', $key ) && ! is_protected_meta( $key, 'post' ) ? $key : '';
	}

	/**
	 * Custom fields that may be shown publicly: registered with show_in_rest (the WordPress signal that a field is
	 * public), ACF fields, or keys allowed by the `auvyx_builder_data_meta_keys` filter. Others (plugin settings, personal
	 * data stored by other plugins) are never read.
	 *
	 * @param string $key       Meta key.
	 * @param string $post_type Post type.
	 */
	public static function meta_allowed( string $key, string $post_type ): bool {
		if ( '' === self::meta_key( $key ) ) {
			return false;
		}
		$registered = get_registered_meta_keys( 'post', $post_type ) + get_registered_meta_keys( 'post' );
		if ( isset( $registered[ $key ] ) && ! empty( $registered[ $key ]['show_in_rest'] ) ) {
			return true;
		}
		if ( function_exists( 'acf_get_field' ) && acf_get_field( $key ) ) {
			return true;
		}
		/** Filters custom field keys Auvyx elements may show (besides REST-registered and ACF fields). */
		return in_array( $key, (array) apply_filters( 'auvyx_builder_data_meta_keys', array(), $post_type ), true );
	}

	/** Valid binding key: a known field, a plugin's field or meta:<key>. */
	public static function valid( string $key ): bool {
		return in_array( $key, self::FIELDS, true ) || ( 0 === strpos( $key, 'meta:' ) && '' !== self::meta_key( substr( $key, 5 ) ) ) || isset( self::extensions()[ $key ] ) || DataSources::is_field( $key );
	}

	/**
	 * Fields added by plugins. `auvyx_builder_data_fields` maps a namespaced key (`woo/stock`) to its label, its group
	 * in Studio's Data menu, its shape (text, url or image) and a callback that returns the value for a post.
	 *
	 * @return array<string, array{label: string, group: string, shape: string, value: callable}>
	 */
	public static function extensions(): array {
		$out = array();
		/** Filters the fields plugins add to Auvyx elements' data (ADR 0036). */
		foreach ( (array) apply_filters( 'auvyx_builder_data_fields', array() ) as $key => $field ) {
			if ( ! is_string( $key ) || 1 !== preg_match( self::EXTENSION_KEY, $key ) || ! is_array( $field ) || ! isset( $field['value'] ) || ! is_callable( $field['value'] ) ) {
				continue;
			}
			$shape       = (string) ( $field['shape'] ?? 'text' );
			$out[ $key ] = array(
				'label' => (string) ( $field['label'] ?? $key ),
				'group' => (string) ( $field['group'] ?? __( 'More', 'auvyx-builder' ) ),
				'shape' => in_array( $shape, self::SHAPES, true ) ? $shape : 'text',
				'value' => $field['value'],
			);
		}
		return $out;
	}

	/**
	 * List sources plugins add to Posts loops (`auvyx_builder_loop_sources`): key → label and the post type it lists.
	 * The plugin applies a source in `auvyx_builder_loop_query_args`.
	 *
	 * @return array<string, array{label: string, postType: string}>
	 */
	public static function sources(): array {
		$out = array();
		/** Filters the list sources of Posts loops (ADR 0036). */
		foreach ( (array) apply_filters( 'auvyx_builder_loop_sources', array() ) as $key => $source ) {
			if ( is_string( $key ) && 1 === preg_match( self::EXTENSION_KEY, $key ) && is_array( $source ) ) {
				$out[ $key ] = array(
					'label'    => (string) ( $source['label'] ?? $key ),
					'postType' => sanitize_key( (string) ( $source['postType'] ?? 'post' ) ),
				);
			}
		}
		return $out;
	}

	/**
	 * Plain-text (or URL) value of a field for a post. Post fields are empty for posts the visitor may not read.
	 *
	 * @param string $key     Field key.
	 * @param int    $post_id Post the field is read from.
	 */
	public static function value( string $key, int $post_id ): string {
		switch ( $key ) {
			case 'site_title':
				return (string) get_bloginfo( 'name' );
			case 'site_tagline':
				return (string) get_bloginfo( 'description' );
			case 'site_url':
				return home_url( '/' );
			case 'site_logo':
				$logo = (int) get_theme_mod( 'custom_logo' );
				return $logo ? (string) wp_get_attachment_image_url( $logo, 'full' ) : '';
			case 'archive_title':
				if ( is_archive() ) {
					// The name alone ("Hoodies", not "Category: Hoodies"), like the theme's titles.
					add_filter( 'get_the_archive_title_prefix', '__return_empty_string' );
					$title = wp_strip_all_tags( get_the_archive_title() );
					remove_filter( 'get_the_archive_title_prefix', '__return_empty_string' );
					return $title;
				}
				return is_home() ? (string) single_post_title( '', false ) : '';
		}
		$post = get_post( $post_id );
		if ( ! $post || ( ! is_post_publicly_viewable( $post ) && ! current_user_can( 'read_post', $post->ID ) ) ) {
			return '';
		}
		if ( 0 === strpos( $key, 'meta:' ) ) {
			$meta_key = self::meta_key( substr( $key, 5 ) );
			$value    = '' === $meta_key || ! self::meta_allowed( $meta_key, $post->post_type ) || post_password_required( $post ) ? '' : get_post_meta( $post->ID, $meta_key, true );
			return is_scalar( $value ) ? (string) $value : '';
		}
		switch ( $key ) {
			case 'post_title':
				return wp_strip_all_tags( html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ) );
			case 'post_excerpt':
				return wp_strip_all_tags( html_entity_decode( get_the_excerpt( $post ), ENT_QUOTES, 'UTF-8' ) );
			case 'post_date':
				return (string) get_the_date( '', $post );
			case 'post_author':
				return (string) get_the_author_meta( 'display_name', (int) $post->post_author );
			case 'post_categories':
				$terms = get_the_terms( $post, self::category_taxonomy( $post->post_type ) );
				return is_array( $terms ) ? implode( ', ', wp_list_pluck( $terms, 'name' ) ) : '';
			case 'post_url':
				return (string) get_permalink( $post );
			case 'featured_image':
				return self::image_url( $post );
			case 'featured_image_alt':
				$thumb = (int) get_post_thumbnail_id( $post );
				return $thumb ? (string) get_post_meta( $thumb, '_wp_attachment_image_alt', true ) : wp_strip_all_tags( get_the_title( $post ) );
		}
		$extensions = self::extensions();
		if ( isset( $extensions[ $key ] ) ) {
			if ( post_password_required( $post ) ) {
				return '';
			}
			$value = call_user_func( $extensions[ $key ]['value'], $post );
			return is_scalar( $value ) ? (string) $value : '';
		}
		return self::product_value( $key, $post->ID );
	}

	/** WooCommerce fields; empty without WooCommerce or for non-products. */
	private static function product_value( string $key, int $post_id ): string {
		if ( ! function_exists( 'wc_get_product' ) ) {
			return '';
		}
		$product = wc_get_product( $post_id );
		if ( ! $product ) {
			return '';
		}
		switch ( $key ) {
			case 'product_price':
				// Visible prices only ("$20.00 $18.00", "$18.00 – $45.00"), without the screen-reader sentences.
				$html = preg_replace( '#<span[^>]*class="[^"]*screen-reader-text[^"]*"[^>]*>.*?</span>#is', '', (string) $product->get_price_html() );
				return trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( html_entity_decode( (string) $html, ENT_QUOTES, 'UTF-8' ) ) ) );
			case 'product_sku':
				return (string) $product->get_sku();
			case 'product_add_to_cart_url':
				return (string) $product->add_to_cart_url();
			case 'product_add_to_cart_text':
				return (string) $product->add_to_cart_text();
		}
		return '';
	}

	/**
	 * Values of every field for a post (+ its public custom fields), for previews in Auvyx Studio.
	 *
	 * @return array<string, string>
	 */
	public static function values( int $post_id ): array {
		$out = array();
		foreach ( array_merge( self::FIELDS, array_keys( self::extensions() ) ) as $key ) {
			$out[ $key ] = self::value( $key, $post_id );
		}
		$type = (string) get_post_type( $post_id );
		foreach ( array_keys( (array) get_post_meta( $post_id ) ) as $meta_key ) {
			if ( self::meta_allowed( (string) $meta_key, $type ) ) {
				$out[ 'meta:' . $meta_key ] = self::value( 'meta:' . $meta_key, $post_id );
			}
		}
		return $out;
	}

	/**
	 * What Auvyx Studio gets: values of the edited post, post types a loop can show.
	 *
	 * @return array{values: array<string, string>, postTypes: array<int, array{slug: string, label: string}>}
	 */
	public static function studio_config( int $post_id ): array {
		$types = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $type ) {
			if ( 'attachment' !== $type->name ) {
				$taxonomies = array();
				foreach ( get_object_taxonomies( $type->name, 'objects' ) as $taxonomy ) {
					if ( ! $taxonomy->public || 'post_format' === $taxonomy->name ) {
						continue;
					}
					$terms        = get_terms(
						array(
							'taxonomy'   => $taxonomy->name,
							'hide_empty' => false,
							'number'     => 60,
						)
					);
					$taxonomies[] = array(
						'slug'  => $taxonomy->name,
						'label' => (string) $taxonomy->labels->name,
						'terms' => is_array( $terms ) ? array_map(
							static fn( $t ) => array(
								'slug' => $t->slug,
								'name' => $t->name,
							),
							$terms
						) : array(),
					);
				}
				$types[] = array(
					'slug'       => $type->name,
					'label'      => (string) $type->labels->name,
					'taxonomies' => $taxonomies,
				);
			}
		}
		$fields = array();
		foreach ( self::extensions() as $key => $field ) {
			$fields[] = array(
				'key'   => $key,
				'label' => $field['label'],
				'group' => $field['group'],
				'shape' => $field['shape'],
			);
		}
		$sources = array();
		foreach ( self::sources() as $key => $source ) {
			$sources[] = array( 'key' => $key ) + $source;
		}
		$data    = DataSources::studio_config();
		$sources = array_merge( $sources, $data['sources'] );
		$fields  = array_merge( $fields, $data['fields'] );
		return array(
			'values'    => self::values( $post_id ),
			'postTypes' => $types,
			'fields'    => $fields,
			'sources'   => $sources,
		);
	}

	// ---- render ------------------------------------------------------------------------------

	/**
	 * Applies `auvyx/data` bindings to a rendered Auvyx block.
	 *
	 * @param string               $html     Rendered block.
	 * @param array<string, mixed> $block    Parsed block.
	 * @param \WP_Block|null       $instance Block instance (context: postId inside loops).
	 */
	public function apply( $html, $block, $instance = null ): string {
		$html     = (string) $html;
		$bindings = $block['attrs']['metadata']['bindings'] ?? null;
		$name     = (string) ( $block['blockName'] ?? '' );
		if ( '' === $html || ! is_array( $bindings ) || ! isset( self::BINDABLE[ $name ] ) ) {
			return $html;
		}
		$post_id = $instance instanceof \WP_Block && isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : (int) get_the_ID();
		// A heading's link wraps its words: the words go in first.
		if ( isset( $bindings['href'] ) && 'auvyx/heading' === $name ) {
			$bindings = array_merge( array_diff_key( $bindings, array( 'href' => 1 ) ), array( 'href' => $bindings['href'] ) );
		}
		foreach ( $bindings as $attr => $binding ) {
			$key = is_array( $binding ) && self::SOURCE === ( $binding['source'] ?? '' ) ? (string) ( $binding['args']['key'] ?? '' ) : '';
			if ( '' === $key || ! self::valid( $key ) || ! in_array( $attr, self::BINDABLE[ $name ], true ) ) {
				continue;
			}
			// An item of a data source (a loop over `data/<name>`): its own fields, not a post's.
			$value = DataSources::is_field( $key )
				? (string) ( $instance instanceof \WP_Block && is_array( $instance->context['auvyx/item'] ?? null ) ? ( $instance->context['auvyx/item'][ $key ] ?? '' ) : '' )
				: self::value( $key, $post_id );
			if ( '' === $value && ( 'content' === $attr || 'text' === $attr || ( 'url' === $attr && in_array( $name, array( 'auvyx/image', 'auvyx/button' ), true ) ) ) ) {
				return ''; // Nothing to show (no image, no sale, no rating, no size guide): no empty element.
			}
			$html = self::replace( $html, $name, (string) $attr, $value, $key, $post_id );
		}
		return $html;
	}

	/** Puts a value into the block's markup: the text of its element, or an attribute. */
	private static function replace( string $html, string $name, string $attr, string $value, string $key, int $post_id ): string {
		if ( 'content' === $attr || 'text' === $attr ) {
			$tag = 'auvyx/button' === $name ? 'a' : ( 'auvyx/text' === $name ? 'p' : 'h[1-6]' );
			$out = preg_replace_callback(
				'#^(\s*<(' . $tag . ')\b[^>]*>).*(</\2>\s*)$#is',
				static function ( array $m ) use ( $value ) {
					return $m[1] . esc_html( $value ) . $m[3];
				},
				$html
			);
			return null === $out ? $html : $out; // a regex failure keeps the block as it was
		}
		if ( 'auvyx/heading' === $name && 'href' === $attr ) {
			$url = esc_url( $value );
			if ( '' === $url ) {
				return $html; // no address: the heading stays plain words
			}
			$out = preg_replace_callback(
				'#^(\s*<(h[1-6])\b[^>]*>)(.*)(</\2>\s*)$#is',
				static function ( array $m ) use ( $url ) {
					return $m[1] . '<a class="auvyx-heading-link" href="' . $url . '">' . $m[3] . '</a>' . $m[4];
				},
				$html
			);
			return null === $out ? $html : $out;
		}
		$processor = new \WP_HTML_Tag_Processor( $html );
		if ( 'auvyx/image' === $name && 'href' !== $attr ) {
			if ( ! $processor->next_tag( 'img' ) ) {
				return $html;
			}
			if ( 'alt' === $attr ) {
				$processor->set_attribute( 'alt', $value );
				return $processor->get_updated_html();
			}
			$processor->set_attribute( 'src', esc_url_raw( $value ) );
			$processor->remove_attribute( 'srcset' );
			$processor->remove_attribute( 'sizes' );
			$thumb = 'featured_image' === $key ? (int) get_post_thumbnail_id( $post_id ) : 0;
			$set   = $thumb ? wp_get_attachment_image_srcset( $thumb, 'large' ) : false;
			// Cards of other posts (loops) load lazily and pick their file from their real width (`sizes="auto"`), so
			// a row of product photos never competes with the hero for the first paint.
			$card = (int) get_queried_object_id() !== (int) $post_id;
			if ( $card && null === $processor->get_attribute( 'loading' ) ) {
				$processor->set_attribute( 'loading', 'lazy' );
			}
			if ( $set ) {
				$processor->set_attribute( 'srcset', $set );
				$processor->set_attribute( 'sizes', ( $card ? 'auto, ' : '' ) . '(max-width: 1024px) 100vw, 1024px' );
			}
			return $processor->get_updated_html();
		}
		// Links: button url, image href (the bound element carries a placeholder href, see Studio).
		if ( $processor->next_tag( 'a' ) ) {
			$processor->set_attribute( 'href', esc_url_raw( $value ) );
		}
		return $processor->get_updated_html();
	}

	// ---- REST: loop previews -------------------------------------------------------------------

	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			'/data/posts',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_posts' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}

	/**
	 * Field values of the posts a Posts loop query returns (the query is clamped like render.php).
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function rest_posts( $request ): \WP_REST_Response {
		$data = DataSources::source_name( (string) $request->get_param( 'source' ) );
		if ( '' !== $data ) {
			return new \WP_REST_Response( DataSources::items_for( $data, min( 50, max( 1, absint( $request->get_param( 'perPage' ) ? $request->get_param( 'perPage' ) : 3 ) ) ) ) );
		}
		add_filter( 'auvyx_builder_is_preview', '__return_true' ); // see Studio::rest_render()
		// `current`: the item the edited part is previewed with (related products of that product).
		$current = absint( $request->get_param( 'current' ) );
		$query   = new \WP_Query( self::query_args( (array) $request->get_params(), 0, 1, $current && current_user_can( 'read_post', $current ) ? $current : -1 ) );
		remove_filter( 'auvyx_builder_is_preview', '__return_true' );
		$out = array();
		foreach ( $query->posts as $post ) {
			$id    = $post instanceof \WP_Post ? $post->ID : (int) $post;
			$out[] = array( '_id' => (string) $id ) + self::values( $id ); // _id: previews of plugin blocks inside the loop
		}
		return new \WP_REST_Response( $out );
	}

	/**
	 * WP_Query args of a Posts loop (auvyx/loop `query` attribute), with limits.
	 *
	 * @param array<string, mixed> $q       Query attribute.
	 * @param int                  $exclude Post to leave out (0 = none).
	 * @param int                  $page    Page number when the loop paginates.
	 * @param int                  $current The page's own post for list sources (-1: the queried post).
	 * @return array<string, mixed>
	 */
	public static function query_args( array $q, int $exclude = 0, int $page = 1, int $current = -1 ): array {
		$type     = sanitize_key( (string) ( $q['postType'] ?? 'post' ) );
		$type     = post_type_exists( $type ) && is_post_type_viewable( $type ) ? $type : 'post';
		$order_by = (string) ( $q['orderBy'] ?? 'date' );
		$args     = array(
			'post_type'           => $type,
			'post_status'         => 'publish',
			'posts_per_page'      => max( 1, min( 50, (int) ( $q['perPage'] ?? 3 ) ) ),
			'offset'              => max( 0, min( 100, (int) ( $q['offset'] ?? 0 ) ) ),
			'orderby'             => in_array( $order_by, array( 'date', 'modified', 'title', 'menu_order', 'comment_count', 'rand' ), true ) ? $order_by : 'date',
			'order'               => 'asc' === strtolower( (string) ( $q['order'] ?? 'desc' ) ) ? 'ASC' : 'DESC',
			'ignore_sticky_posts' => true,
			'no_found_rows'       => empty( $q['paginate'] ),
		);
		// menu order ties (everything left at 0) are settled by title, as WooCommerce's default sorting does
		if ( 'menu_order' === $args['orderby'] ) {
			$args['orderby'] = array(
				'menu_order' => $args['order'],
				'title'      => 'ASC',
			);
		}
		if ( $page > 1 ) {
			$args['paged'] = $page;
			// WP_Query ignores `paged` when an offset is set: shift the offset instead.
			$args['offset'] = $args['offset'] + ( $page - 1 ) * $args['posts_per_page'];
		}
		// Category / tag filter: a public taxonomy of that post type, existing terms by slug.
		$taxonomy = sanitize_key( (string) ( $q['taxonomy'] ?? '' ) );
		$terms    = array_values( array_filter( array_map( 'sanitize_title', explode( ',', (string) ( $q['terms'] ?? '' ) ) ) ) );
		if ( '' !== $taxonomy && $terms && taxonomy_exists( $taxonomy ) && is_object_in_taxonomy( $type, $taxonomy ) && is_taxonomy_viewable( $taxonomy ) ) {
			$args['tax_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- the author's filter.
				array(
					'taxonomy' => $taxonomy,
					'field'    => 'slug',
					'terms'    => array_slice( $terms, 0, 20 ),
				),
			);
		}
		// Hand-picked items replace the query: just those, in the picked order (Flatsome's "ids").
		$include = array_slice( array_values( array_unique( array_filter( array_map( 'absint', explode( ',', (string) ( $q['include'] ?? '' ) ) ) ) ) ), 0, 50 );
		if ( $include ) {
			$args['post__in']       = $include;
			$args['orderby']        = 'post__in';
			$args['posts_per_page'] = count( $include );
			$args['offset']         = 0;
			unset( $args['tax_query'], $args['paged'] );
		}
		if ( $exclude > 0 ) {
			$args['post__not_in'] = array( $exclude ); // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_post__not_in -- one id, opt-in.
		}
		$source = (string) ( $q['source'] ?? '' );
		/**
		 * Filters a Posts loop's query. Plugins apply their list sources (`$source`, see `auvyx_builder_loop_sources`)
		 * and their own rules (catalog visibility) here.
		 *
		 * @param array  $args    WP_Query args.
		 * @param string $source  List source key ('' = the query as set).
		 * @param int    $current The page's own post (singular views), for sources such as related products.
		 */
		return (array) apply_filters( 'auvyx_builder_loop_query_args', $args, isset( self::sources()[ $source ] ) ? $source : '', $current >= 0 ? $current : ( is_singular() ? (int) get_queried_object_id() : 0 ) );
	}
}
