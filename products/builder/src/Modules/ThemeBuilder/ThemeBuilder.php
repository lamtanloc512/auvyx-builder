<?php
/**
 * The Theme Builder (docs/theme-builder.md), the way Elementor's works, so people who know it need nothing new: the
 * site's headers and footers are templates of their own; each says where it shows with display conditions (Include /
 * Exclude: Entire Site, Front Page, pages, kinds of post…), set when it is first published and changed later from the
 * Theme Builder or the Studio. On a page, the template whose conditions match shows in place of the theme's part; the
 * more specific condition wins (a page named over Entire Site), the newest template on a tie.
 *
 * A template is a synced pattern (`wp_block`, ADR 0019) marked `_auvyx_part` = header|footer, its conditions in
 * `_auvyx_conditions`. Editing it changes every page that shows it: it is rendered on each request, never copied. Needs a
 * block theme (the header and footer are its template parts); with no template matching, the theme's own part shows.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\ThemeBuilder;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Components\Components;
use Auvyx\Builder\Modules\Studio\Library;
use Auvyx\Builder\Modules\Studio\Parts;
use Auvyx\Builder\Modules\Studio\Studio;

defined( 'ABSPATH' ) || exit;

final class ThemeBuilder implements Module {

	/** Post meta: which part of the site a template is (`header` or `footer`). */
	public const PART = '_auvyx_part';

	/** Post meta: its display conditions, `[{type: include|exclude, rule, ids, postTypes, …}]`. */
	public const CONDITIONS = '_auvyx_conditions';

	/** The kinds of template. */
	public const TYPES = array( 'header', 'footer' );

	/** Query parameter prefix of a preview: `auvyx-preview-header` = a template id or "theme" (people who edit only). */
	public const PREVIEW = 'auvyx-preview-';

	private const CACHE_KEY = 'auvyx_site_parts';

	/** How specific a condition is: the more specific one wins. */
	private const SPECIFIC = array(
		'ids'      => 60,
		'front'    => 50,
		'terms'    => 40,
		'search'   => 40,
		'notfound' => 40,
		'singular' => 30,
		'archive'  => 30,
		'blog'     => 30,
		'all'      => 10,
	);

	/** @var Components */
	private $components;

	/** @var array<int, array{type: string, conditions: array<int, array<string, mixed>>}>|null Per request. */
	private static $parts = null;

	public function __construct( Components $components ) {
		$this->components = $components;
	}

	public function id(): string {
		return 'theme-builder';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		// Before the parts editor (10) and the components placed after the header (10): those apply to what this returns.
		add_filter( 'render_block_core/template-part', array( $this, 'render_part' ), 5, 2 );
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
		add_action( 'save_post_wp_block', array( self::class, 'flush' ) );
		add_action( 'deleted_post', array( self::class, 'flush' ) );
		add_action( 'trashed_post', array( self::class, 'flush' ) );
		add_action( 'untrashed_post', array( self::class, 'flush' ) );
		add_action( 'updated_post_meta', array( $this, 'flush_on_meta' ), 10, 3 );
		add_action( 'added_post_meta', array( $this, 'flush_on_meta' ), 10, 3 );
		add_action( 'deleted_post_meta', array( $this, 'flush_on_meta' ), 10, 3 );
		// The Theme Builder previews each template on the real site: no admin bar there.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence only; who may preview is checked in preview().
		if ( isset( $_GET[ self::PREVIEW . 'header' ] ) || isset( $_GET[ self::PREVIEW . 'footer' ] ) ) {
			add_filter( 'show_admin_bar', '__return_false' );
		}
	}

	// ---- the templates ---------------------------------------------------------------------------------------------

	/**
	 * Published templates: id → type and conditions (cached).
	 *
	 * @return array<int, array{type: string, conditions: array<int, array<string, mixed>>}>
	 */
	public static function all(): array {
		if ( null !== self::$parts ) {
			return self::$parts;
		}
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			self::$parts = $cached;
			return $cached;
		}
		$posts = get_posts(
			array(
				'post_type'      => 'wp_block',
				'post_status'    => 'publish',
				'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage -- cached; a site has a few templates.
				'orderby'        => 'ID',
				'order'          => 'DESC',
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- cached: runs when a template changes.
				'meta_key'       => self::PART,
			)
		);
		$parts = array();
		foreach ( $posts as $post ) {
			$type = (string) get_post_meta( $post->ID, self::PART, true );
			if ( in_array( $type, self::TYPES, true ) && Library::synced( (int) $post->ID ) ) {
				$parts[ (int) $post->ID ] = array(
					'type'       => $type,
					'conditions' => self::sanitize_conditions( get_post_meta( $post->ID, self::CONDITIONS, true ) ),
				);
			}
		}
		set_transient( self::CACHE_KEY, $parts );
		self::$parts = $parts;
		return $parts;
	}

	/** @return int[] The templates of one type, newest first. */
	public static function of_type( string $type ): array {
		return array_keys(
			array_filter(
				self::all(),
				static fn( $part ) => $type === $part['type']
			)
		);
	}

	/** The type of a template (`header`/`footer`), or "" when the post is not one. */
	public static function type_of( int $id ): string {
		$type = (string) get_post_meta( $id, self::PART, true );
		return 'wp_block' === get_post_type( $id ) && in_array( $type, self::TYPES, true ) ? $type : '';
	}

	public static function flush(): void {
		delete_transient( self::CACHE_KEY );
		self::$parts = null;
	}

	/**
	 * @param int    $meta_id  Meta id.
	 * @param int    $post_id  Post id.
	 * @param string $meta_key Meta key.
	 */
	public function flush_on_meta( $meta_id, $post_id, $meta_key ): void {
		unset( $meta_id, $post_id );
		if ( in_array( $meta_key, array( self::PART, self::CONDITIONS, Library::SYNC ), true ) ) {
			self::flush();
		}
	}

	// ---- conditions ------------------------------------------------------------------------------------------------

	/**
	 * Display conditions as stored: each an Include or an Exclude of one rule (Components::sanitize_rule).
	 *
	 * @param mixed $value Raw conditions.
	 * @return array<int, array<string, mixed>>
	 */
	public static function sanitize_conditions( $value ): array {
		$out = array();
		foreach ( is_array( $value ) ? $value : array() as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$out[] = array( 'type' => 'exclude' === ( $item['type'] ?? '' ) ? 'exclude' : 'include' ) + Components::sanitize_rule( $item );
		}
		return array_slice( $out, 0, 30 );
	}

	/**
	 * How strongly a template claims this request: 0 when it does not (no Include matches, or an Exclude does), else the
	 * specificity of its most specific matching Include.
	 *
	 * @param array<int, array<string, mixed>> $conditions Conditions.
	 */
	public static function claim( array $conditions ): int {
		$best = 0;
		foreach ( $conditions as $condition ) {
			if ( ! Components::rule_matches( $condition ) ) {
				continue;
			}
			if ( 'exclude' === $condition['type'] ) {
				return 0;
			}
			$best = max( $best, self::SPECIFIC[ $condition['rule'] ] ?? 10 );
		}
		return $best;
	}

	/**
	 * The template that shows as this part of the page being viewed, or 0 for the theme's own.
	 *
	 * @param string $type `header` or `footer`.
	 */
	public static function for_request( string $type ): int {
		$preview = self::preview( $type );
		if ( null !== $preview ) {
			return $preview;
		}
		$best  = 0;
		$score = 0;
		// Newest first: on a tie the newest template wins.
		foreach ( self::of_type( $type ) as $id ) {
			$claim = self::claim( self::all()[ $id ]['conditions'] );
			if ( $claim > $score ) {
				$best  = $id;
				$score = $claim;
			}
		}
		return $best;
	}

	/**
	 * A preview's choice (`?auvyx-preview-header=12|theme`), for people who edit; null when none.
	 *
	 * @param string $type `header` or `footer`.
	 */
	private static function preview( string $type ): ?int {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only: it changes what this one response shows.
		$raw = isset( $_GET[ self::PREVIEW . $type ] ) ? sanitize_key( wp_unslash( $_GET[ self::PREVIEW . $type ] ) ) : '';
		if ( '' === $raw || ! current_user_can( 'edit_posts' ) ) {
			return null;
		}
		if ( 'theme' === $raw ) {
			return 0;
		}
		$id = (int) $raw;
		return $id > 0 && 'wp_block' === get_post_type( $id ) && Library::synced( $id ) ? $id : 0;
	}

	/**
	 * Condition rules → label, as the Theme Builder names them (Auvyx Builder Pro adds its own: archives, search, 404…).
	 *
	 * @return array<string, string>
	 */
	public static function rule_labels(): array {
		$labels = array(
			'all'      => __( 'Entire Site', 'auvyx-builder' ),
			'front'    => __( 'Front Page', 'auvyx-builder' ),
			'ids'      => __( 'Specific Pages', 'auvyx-builder' ),
			'singular' => __( 'All Of A Kind', 'auvyx-builder' ),
		);
		/**
		 * Header and footer conditions Auvyx Builder Pro adds (archives, blog, terms, search, 404): id → label. Pro answers
		 * them (`auvyx_builder_location_matches`); without Pro they are not offered.
		 *
		 * @param array<string, string> $more
		 */
		$more = apply_filters( 'auvyx_builder_theme_rules', array() );
		foreach ( is_array( $more ) ? $more : array() as $id => $label ) {
			if ( is_string( $id ) && isset( self::SPECIFIC[ $id ] ) && ! isset( $labels[ $id ] ) ) {
				$labels[ $id ] = (string) $label;
			}
		}
		return $labels;
	}

	/** Rules only Auvyx Builder Pro answers (docs/editions.md: display rules). @return string[] */
	public static function pro_rules(): array {
		return array_values( array_diff( array_keys( self::rule_labels() ), Components::BASIC_RULES ) );
	}

	/** One condition in words: "Entire Site", "About, Contact", "All Pages". @param array<string, mixed> $condition */
	public static function describe_one( array $condition ): string {
		$labels = self::rule_labels();
		switch ( $condition['rule'] ) {
			case 'ids':
				return $condition['ids'] ? Components::titles( $condition['ids'] ) : $labels['ids'];
			case 'singular':
				$names = array_map(
					static function ( $type ) {
						$object = get_post_type_object( $type );
						return $object ? $object->labels->name : $type;
					},
					$condition['postTypes']
				);
				/* translators: %s: kinds of post ("Pages, Posts") */
				return $names ? sprintf( __( 'All %s', 'auvyx-builder' ), implode( ', ', $names ) ) : __( 'All Posts And Pages', 'auvyx-builder' );
			default:
				return $labels[ $condition['rule'] ] ?? $condition['rule'];
		}
	}

	/** "Entire Site, except About" or "" when it has no conditions (shown nowhere). @param array<int, array<string, mixed>> $conditions */
	public static function describe( array $conditions ): string {
		$in  = array();
		$out = array();
		foreach ( $conditions as $condition ) {
			if ( 'exclude' === $condition['type'] ) {
				$out[] = self::describe_one( $condition );
			} else {
				$in[] = self::describe_one( $condition );
			}
		}
		if ( ! $in ) {
			return '';
		}
		/* translators: %s: pages left out */
		return implode( ' · ', $in ) . ( $out ? ', ' . sprintf( __( 'except %s', 'auvyx-builder' ), implode( ', ', $out ) ) : '' );
	}

	/**
	 * Other templates of the same type that claim exactly the same pages: the Theme Builder warns, as the newest wins.
	 *
	 * @return array<int, string> id → title
	 */
	public static function conflicts( int $id ): array {
		$all = self::all();
		if ( ! isset( $all[ $id ] ) ) {
			return array();
		}
		$sign = static function ( array $conditions ): array {
			$keys = array();
			foreach ( $conditions as $c ) {
				if ( 'include' === $c['type'] ) {
					$ids   = $c['ids'];
					$types = $c['postTypes'];
					sort( $ids );
					sort( $types );
					$keys[] = $c['rule'] . ':' . implode( ',', $ids ) . ':' . implode( ',', $types ) . ':' . implode( ',', $c['terms'] );
				}
			}
			return $keys;
		};
		$mine = $sign( $all[ $id ]['conditions'] );
		$out  = array();
		foreach ( $all as $other => $part ) {
			if ( $other !== $id && $part['type'] === $all[ $id ]['type'] && array_intersect( $mine, $sign( $part['conditions'] ) ) ) {
				$out[ $other ] = get_the_title( $other );
			}
		}
		return $out;
	}

	// ---- rendering -------------------------------------------------------------------------------------------------

	/**
	 * The type of a template part block, from its attributes: `header`, `footer` or "".
	 *
	 * @param array<string, mixed> $attrs Block attributes.
	 */
	public static function region_of( array $attrs ): string {
		foreach ( self::TYPES as $type ) {
			if ( ( $attrs['area'] ?? '' ) === $type || ( $attrs['tagName'] ?? '' ) === $type || preg_match( '/^' . $type . '\b/', (string) ( $attrs['slug'] ?? '' ) ) ) {
				return $type;
			}
		}
		return '';
	}

	/**
	 * The theme's header or footer part, or the template whose conditions claim this page.
	 *
	 * @param string               $html  Rendered part.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render_part( $html, $block ): string {
		if ( is_admin() || ! Parts::supported() ) {
			return (string) $html;
		}
		$attrs = (array) ( $block['attrs'] ?? array() );
		$type  = self::region_of( $attrs );
		$id    = '' !== $type ? self::for_request( $type ) : 0;
		if ( ! $id ) {
			return (string) $html;
		}
		$inner = $this->components->render( $id );
		if ( '' === $inner ) {
			return (string) $html;
		}
		$tag = in_array( $attrs['tagName'] ?? '', array( 'header', 'footer', 'div', 'section' ), true ) ? (string) $attrs['tagName'] : $type;
		return '<' . $tag . ' class="wp-block-template-part auvyx-layout-part auvyx-layout-part--' . esc_attr( $type ) . '" data-auvyx-component="' . esc_attr( (string) $id ) . '">' . $inner . '</' . $tag . '>';
	}

	// ---- REST: the Studio's "Add New Header" and display conditions -------------------------------------------------

	public function register_rest(): void {
		$can = static fn() => current_user_can( 'edit_theme_options' );
		register_rest_route(
			'auvyx/v1',
			'/theme-builder',
			array(
				'methods'             => 'POST',
				'permission_callback' => $can,
				'args'                => array(
					'type'    => array(
						'type'     => 'string',
						'enum'     => self::TYPES,
						'required' => true,
					),
					'title'   => array(
						'type'     => 'string',
						'required' => true,
					),
					'content' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
				'callback'            => array( self::class, 'rest_create' ),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/theme-builder/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'permission_callback' => $can,
				'args'                => array(
					'conditions' => array(
						'type'     => 'array',
						'required' => true,
					),
				),
				'callback'            => array( self::class, 'rest_conditions' ),
			)
		);
	}

	/**
	 * A new template from a starting point the Studio chose (a kit's header, the theme's, or empty). Published with no
	 * conditions: it shows nowhere until it is given some, at its first Publish.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_create( $request ) {
		$type    = (string) $request['type'];
		$content = (string) $request['content'];
		if ( ! current_user_can( 'unfiltered_html' ) ) {
			$content = wp_kses_post( $content );
		}
		$id = wp_insert_post(
			array(
				'post_type'    => 'wp_block',
				'post_status'  => 'publish',
				'post_title'   => sanitize_text_field( (string) $request['title'] ),
				'post_content' => wp_slash( $content ),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		update_post_meta( (int) $id, self::PART, $type );
		update_post_meta( (int) $id, self::CONDITIONS, array() );
		self::flush();
		return new \WP_REST_Response(
			array(
				'id'      => (int) $id,
				'editUrl' => Studio::url( (int) $id ),
			),
			201
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_conditions( $request ) {
		$id = (int) $request['id'];
		if ( '' === self::type_of( $id ) ) {
			return new \WP_Error( 'auvyx_theme_builder_part', __( 'This is not a header or a footer of the Theme Builder.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		update_post_meta( $id, self::CONDITIONS, self::sanitize_conditions( $request['conditions'] ) );
		self::flush();
		return new \WP_REST_Response( self::state( $id ) );
	}

	/**
	 * What the Studio shows about a template: its conditions, in words, and the templates it conflicts with.
	 *
	 * @return array{type: string, conditions: array<int, array<string, mixed>>, summary: string, conflicts: string[]}
	 */
	public static function state( int $id ): array {
		$conditions = self::sanitize_conditions( get_post_meta( $id, self::CONDITIONS, true ) );
		return array(
			'type'       => self::type_of( $id ),
			'conditions' => $conditions,
			'summary'    => self::describe( $conditions ),
			'conflicts'  => array_values( self::conflicts( $id ) ),
		);
	}

	/**
	 * The Studio's config for a template being edited: its state, and what the conditions dialog offers. Null for any
	 * other document.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function studio_config( \WP_Post $post ): ?array {
		if ( '' === self::type_of( (int) $post->ID ) ) {
			return null;
		}
		$pages = get_posts(
			array(
				'post_type'      => array_values( array_diff( get_post_types( array( 'public' => true ) ), array( 'attachment' ) ) ),
				'post_status'    => array( 'publish', 'draft', 'private', 'future' ),
				'posts_per_page' => 300, // phpcs:ignore WordPress.WP.PostsPerPage -- titles for one picker.
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		$types = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $object ) {
			if ( 'attachment' !== $object->name ) {
				$types[] = array(
					'value' => $object->name,
					'label' => $object->labels->name,
				);
			}
		}
		$rules = array();
		foreach ( self::rule_labels() as $rule => $label ) {
			$rules[] = array(
				'value' => $rule,
				'label' => $label,
				'pro'   => in_array( $rule, self::pro_rules(), true ),
			);
		}
		return self::state( (int) $post->ID ) + array(
			'pages'      => array_map(
				static fn( \WP_Post $page ) => array(
					'value' => (string) $page->ID,
					'label' => '' !== get_the_title( $page ) ? get_the_title( $page ) : __( '(untitled)', 'auvyx-builder' ),
				),
				$pages
			),
			'postTypes'  => $types,
			'rules'      => $rules,
			'builderUrl' => admin_url( 'admin.php?page=' . Studio::MENU . '-parts' ),
			'blockTheme' => Parts::supported(),
		);
	}
}
