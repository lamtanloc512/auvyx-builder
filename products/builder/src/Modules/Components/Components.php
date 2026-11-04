<?php
/**
 * Components (ADR 0019) = WordPress synced patterns (`wp_block`), so instances
 * are native `<!-- wp:block {"ref":ID} /-->` references: insertable from the
 * block editor too, and still rendered by core if Auvyx Builder is removed.
 *
 * Adds what Flatsome users expect from "UX Blocks":
 * - display locations: render a component at a theme position or hook, with conditions;
 * - a [auvyx_component id="…"] shortcode for widgets, classic content and other builders.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Components;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\VisualBuilder\VisualBuilder;

defined( 'ABSPATH' ) || exit;

final class Components implements Module {

	const META      = '_auvyx_locations';
	const CACHE_KEY = 'auvyx_component_locations';
	const RULES     = array( 'all', 'front', 'singular', 'ids', 'archive', 'blog', 'terms', 'search', 'notfound' );
	/** Who sees it: everyone, signed-in people, or visitors who are not signed in. */
	const AUDIENCES = array( 'all', 'in', 'out' );

	/** @var array<int, true> Components being rendered (recursion guard). */
	private $rendering = array();

	public function id(): string {
		return 'components';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_meta' ) );
		add_shortcode( 'auvyx_component', array( $this, 'shortcode' ) );
		add_action( 'wp', array( $this, 'attach_locations' ) );
		add_action( 'save_post_wp_block', array( $this, 'flush' ) );
		add_action( 'deleted_post', array( $this, 'flush' ) );
		add_action( 'updated_post_meta', array( $this, 'flush_on_meta' ), 10, 3 );
		add_action( 'added_post_meta', array( $this, 'flush_on_meta' ), 10, 3 );
	}

	/**
	 * Location id → label. Hooks are attached in attach_locations().
	 *
	 * @return array<string, string>
	 */
	public function location_options(): array {
		$options = array(
			'body_open'      => __( 'at the very top', 'auvyx-builder' ),
			'after_header'   => __( 'under the header', 'auvyx-builder' ),
			'before_content' => __( 'above the page’s content', 'auvyx-builder' ),
			'after_content'  => __( 'below the page’s content', 'auvyx-builder' ),
			'before_footer'  => __( 'above the footer', 'auvyx-builder' ),
		);
		if ( class_exists( 'WooCommerce' ) ) {
			$options += array(
				'woocommerce_before_single_product'        => __( 'above a product', 'auvyx-builder' ),
				'woocommerce_after_single_product_summary' => __( 'below a product’s summary', 'auvyx-builder' ),
				'woocommerce_before_cart'                  => __( 'above the cart', 'auvyx-builder' ),
			);
		}
		return $options;
	}

	public function register_meta(): void {
		register_post_meta(
			'wp_block',
			self::META,
			array(
				'type'              => 'array',
				'single'            => true,
				'default'           => array(),
				'sanitize_callback' => array( $this, 'sanitize_locations' ),
				'auth_callback'     => static function () {
					return current_user_can( 'edit_theme_options' );
				},
				'show_in_rest'      => array(
					'schema' => array(
						'type'  => 'array',
						'items' => array(
							'type'                 => 'object',
							'additionalProperties' => false,
							'properties'           => array(
								'location'  => array( 'type' => 'string' ),
								'rule'      => array(
									'type' => 'string',
									'enum' => self::RULES,
								),
								'postTypes' => array(
									'type'  => 'array',
									'items' => array( 'type' => 'string' ),
								),
								'ids'       => array(
									'type'  => 'array',
									'items' => array( 'type' => 'integer' ),
								),
								'terms'     => array(
									'type'  => 'array',
									'items' => array( 'type' => 'string' ),
								),
								'exclude'   => array(
									'type'  => 'array',
									'items' => array( 'type' => 'integer' ),
								),
								'audience'  => array(
									'type' => 'string',
									'enum' => self::AUDIENCES,
								),
								'roles'     => array(
									'type'  => 'array',
									'items' => array( 'type' => 'string' ),
								),
								'from'      => array( 'type' => 'string' ),
								'until'     => array( 'type' => 'string' ),
							),
						),
					),
				),
			)
		);
	}

	/**
	 * Each location: where (`location`), on which pages (`rule` with `postTypes`, `ids` or `terms` as `taxonomy:term_id`),
	 * never on `exclude`, for whom (`audience`, `roles`) and when (`from` / `until`, the site's dates, inclusive).
	 *
	 * @param mixed $value Raw locations.
	 * @return array<int, array{location: string, rule: string, postTypes: string[], ids: int[], terms: string[], exclude: int[], audience: string, roles: string[], from: string, until: string}>
	 */
	public function sanitize_locations( $value ): array {
		$known  = array_keys( $this->location_options() );
		$output = array();
		foreach ( is_array( $value ) ? $value : array() as $item ) {
			if ( ! is_array( $item ) || ! isset( $item['location'] ) || ! in_array( $item['location'], $known, true ) ) {
				continue;
			}
			$output[] = array( 'location' => (string) $item['location'] ) + self::sanitize_rule( $item );
		}
		return $output;
	}

	/**
	 * On which pages, for whom and when: the part of a location that is not where on the page. Shared with the Theme
	 * Builder's display conditions (Modules/ThemeBuilder).
	 *
	 * @param array<string, mixed> $item Raw rule.
	 * @return array{rule: string, postTypes: string[], ids: int[], terms: string[], exclude: int[], audience: string, roles: string[], from: string, until: string}
	 */
	public static function sanitize_rule( array $item ): array {
		$rule = in_array( $item['rule'] ?? 'all', self::RULES, true ) ? $item['rule'] ?? 'all' : 'all';
		return array(
			'rule'      => (string) $rule,
			'postTypes' => array_values( array_filter( array_map( 'sanitize_key', (array) ( $item['postTypes'] ?? array() ) ) ) ),
			'ids'       => self::ids( $item['ids'] ?? array() ),
			'terms'     => array_values(
				array_filter(
					array_map( 'strval', (array) ( $item['terms'] ?? array() ) ),
					static function ( $term ) {
						return (bool) preg_match( '/^[a-z0-9_-]{1,32}:\d{1,12}$/', $term );
					}
				)
			),
			'exclude'   => self::ids( $item['exclude'] ?? array() ),
			'audience'  => in_array( $item['audience'] ?? 'all', self::AUDIENCES, true ) ? (string) ( $item['audience'] ?? 'all' ) : 'all',
			'roles'     => array_values( array_filter( array_map( 'sanitize_key', (array) ( $item['roles'] ?? array() ) ) ) ),
			'from'      => self::day( $item['from'] ?? '' ),
			'until'     => self::day( $item['until'] ?? '' ),
		);
	}

	/** @param mixed $value Ids. @return int[] */
	private static function ids( $value ): array {
		return array_values(
			array_filter(
				array_map( 'intval', is_array( $value ) ? $value : explode( ',', (string) $value ) ),
				static function ( $id ) {
					return $id > 0;
				}
			)
		);
	}

	/** @param mixed $value A date. "YYYY-MM-DD" or "". */
	private static function day( $value ): string {
		$value = is_string( $value ) ? trim( $value ) : '';
		return preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) && checkdate( (int) substr( $value, 5, 2 ), (int) substr( $value, 8, 2 ), (int) substr( $value, 0, 4 ) ) ? $value : '';
	}

	/**
	 * Components for the builder's library.
	 *
	 * @return array<int, array{id: int, title: string, content: string, locations: array<int, mixed>}>
	 */
	public function all_for_builder(): array {
		$posts = get_posts(
			array(
				'post_type'      => 'wp_block',
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => 100,
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		return array_map(
			static function ( \WP_Post $post ) {
				return array(
					'id'        => $post->ID,
					'title'     => get_the_title( $post ),
					'content'   => $post->post_content,
					'locations' => (array) get_post_meta( $post->ID, self::META, true ),
				);
			},
			$posts
		);
	}

	/** Renders a component's blocks (Auvyx styles are added by the Styles module as usual). */
	public function render( int $id ): string {
		$post = get_post( $id );
		if ( ! $post || 'wp_block' !== $post->post_type || isset( $this->rendering[ $id ] ) ) {
			return '';
		}
		if ( 'publish' !== $post->post_status && ! current_user_can( 'read_post', $id ) ) {
			return '';
		}
		$this->rendering[ $id ] = true;
		$html                   = do_blocks( $post->post_content );
		unset( $this->rendering[ $id ] );
		return $html;
	}

	/**
	 * [auvyx_component id="123"]
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 */
	public function shortcode( $atts ): string {
		$atts = shortcode_atts( array( 'id' => 0 ), (array) $atts, 'auvyx_component' );
		return $this->render( absint( $atts['id'] ) );
	}

	/**
	 * Components with at least one location, cached.
	 *
	 * @return array<int, array<int, array<string, mixed>>> component id → locations
	 */
	public function placed(): array {
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$placed = array();
		$ids    = get_posts(
			array(
				'post_type'      => 'wp_block',
				'post_status'    => 'publish',
				'posts_per_page' => 100,
				'fields'         => 'ids',
				'meta_key'       => self::META, // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		foreach ( $ids as $id ) {
			$locations = $this->sanitize_locations( get_post_meta( (int) $id, self::META, true ) );
			if ( $locations ) {
				$placed[ (int) $id ] = $locations;
			}
		}
		set_transient( self::CACHE_KEY, $placed, DAY_IN_SECONDS );
		return $placed;
	}

	public function flush(): void {
		delete_transient( self::CACHE_KEY );
	}

	/**
	 * @param int    $meta_id  Meta ID.
	 * @param int    $post_id  Post ID.
	 * @param string $meta_key Meta key.
	 */
	public function flush_on_meta( $meta_id, $post_id, $meta_key ): void {
		if ( self::META === $meta_key ) {
			$this->flush();
		}
	}

	/** Rules Auvyx Builder answers itself; the others are Auvyx Builder Pro's (docs/editions.md). */
	const BASIC_RULES = array( 'all', 'front', 'singular', 'ids' );

	/**
	 * Whether a location asks for more than Auvyx Builder's own rules: a Pro rule, pages left out, an audience, roles or dates.
	 *
	 * @param array<string, mixed> $location One location.
	 */
	public static function advanced( array $location ): bool {
		return ! in_array( $location['rule'] ?? 'all', self::BASIC_RULES, true ) || ! empty( $location['exclude'] ) || ! empty( $location['roles'] )
			|| 'all' !== ( $location['audience'] ?? 'all' ) || '' !== ( $location['from'] ?? '' ) || '' !== ( $location['until'] ?? '' );
	}

	/**
	 * Whether this request is one of the pages a basic rule names.
	 *
	 * @param array<string, mixed> $location One location.
	 */
	public static function matches_basic( array $location ): bool {
		switch ( $location['rule'] ?? 'all' ) {
			case 'front':
				return is_front_page();
			case 'singular':
				return is_singular( empty( $location['postTypes'] ) ? array() : $location['postTypes'] );
			case 'ids':
				return is_singular() && in_array( get_queried_object_id(), array_map( 'intval', (array) ( $location['ids'] ?? array() ) ), true );
			default:
				return 'all' === ( $location['rule'] ?? 'all' );
		}
	}

	/**
	 * Whether a location shows on this request. A location with more than the basic rules is Auvyx Builder Pro's to answer;
	 * without Pro it shows nowhere, rather than everywhere.
	 *
	 * @param array<string, mixed> $location One location.
	 */
	public function matches( array $location ): bool {
		return self::rule_matches( $location );
	}

	/**
	 * Whether a rule (a location, or a Theme Builder condition) holds on this request. Beyond the basic rules it is Auvyx
	 * Builder Pro's to answer; without Pro it holds nowhere, rather than everywhere.
	 *
	 * @param array<string, mixed> $location One rule.
	 */
	public static function rule_matches( array $location ): bool {
		if ( self::advanced( $location ) ) {
			/**
			 * Whether a location with display rules beyond the basic ones shows on this request (Auvyx Builder Pro).
			 *
			 * @param bool  $matches  False without Pro.
			 * @param array $location The location.
			 */
			return (bool) apply_filters( 'auvyx_builder_location_matches', false, $location );
		}
		return self::matches_basic( $location );
	}

	/** One line saying where a location shows, for the admin list: "Under the header, on every page". */
	public function describe( array $location ): string {
		$rules = self::rule_labels();
		$where = $this->location_options()[ $location['location'] ?? '' ] ?? (string) ( $location['location'] ?? '' );
		$on    = $rules[ $location['rule'] ?? 'all' ] ?? '';
		$extra = array();
		if ( ! empty( $location['postTypes'] ) && in_array( $location['rule'] ?? '', array( 'singular', 'archive' ), true ) ) {
			$extra[] = implode(
				', ',
				array_map(
					static function ( $type ) {
						$object = get_post_type_object( $type );
						return $object ? $object->labels->name : $type;
					},
					$location['postTypes']
				)
			);
		}
		if ( ! empty( $location['ids'] ) && 'ids' === ( $location['rule'] ?? '' ) ) {
			$extra[] = self::titles( $location['ids'] );
		}
		if ( ! empty( $location['terms'] ) && 'terms' === ( $location['rule'] ?? '' ) ) {
			$names = array();
			foreach ( $location['terms'] as $term ) {
				list( $taxonomy, $id ) = array_pad( explode( ':', $term, 2 ), 2, '' );
				$t                     = get_term( (int) $id, $taxonomy );
				$names[]               = $t instanceof \WP_Term ? $t->name : $term;
			}
			$extra[] = implode( ', ', $names );
		}
		if ( ! empty( $location['exclude'] ) ) {
			/* translators: %s: page titles */
			$extra[] = sprintf( __( 'not on %s', 'auvyx-builder' ), self::titles( $location['exclude'] ) );
		}
		if ( 'in' === ( $location['audience'] ?? 'all' ) ) {
			$extra[] = __( 'signed-in people', 'auvyx-builder' );
		} elseif ( 'out' === ( $location['audience'] ?? 'all' ) ) {
			$extra[] = __( 'visitors not signed in', 'auvyx-builder' );
		}
		if ( ! empty( $location['roles'] ) ) {
			$extra[] = implode( ', ', $location['roles'] );
		}
		if ( '' !== ( $location['from'] ?? '' ) || '' !== ( $location['until'] ?? '' ) ) {
			$extra[] = trim( ( $location['from'] ?? '' ) . ' → ' . ( $location['until'] ?? '' ) );
		}
		/* translators: 1: where on the page ("under the header"), 2: which pages ("every page") */
		$line = sprintf( __( '%1$s, on %2$s', 'auvyx-builder' ), $where, $on );
		return ucfirst( $line ) . ( $extra ? ' (' . implode( '; ', $extra ) . ')' : '' );
	}

	/**
	 * Pages by title, for people ("About, Contact"); a page that is gone keeps its number.
	 *
	 * @param int[] $ids Post ids.
	 */
	public static function titles( array $ids ): string {
		return implode(
			', ',
			array_map(
				static function ( $id ) {
					$title = get_post( (int) $id ) ? get_the_title( (int) $id ) : '';
					return '' !== $title ? $title : '#' . (int) $id;
				},
				$ids
			)
		);
	}

	/**
	 * Posts that insert the component (`<!-- wp:block {"ref":id} /-->` or the shortcode): pages, posts, template parts,
	 * other components. Drafts count: they will be published with it.
	 *
	 * @return int[]
	 */
	public static function inserted_in( int $id ): array {
		global $wpdb;
		$likes = array(
			'%' . $wpdb->esc_like( '"ref":' . $id . '}' ) . '%',
			'%' . $wpdb->esc_like( '"ref":' . $id . ',' ) . '%',
			'%' . $wpdb->esc_like( '[auvyx_component id="' . $id . '"]' ) . '%',
		);
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- a search no WP_Query offers; admin screens only.
		$found = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_status IN ('publish','draft','private','future') AND post_type <> 'revision' AND ID <> %d AND (post_content LIKE %s OR post_content LIKE %s OR post_content LIKE %s) LIMIT 500", $id, $likes[0], $likes[1], $likes[2] ) );
		return array_map( 'intval', (array) $found );
	}

	/**
	 * Everywhere a component shows, in words: as the site's header or footer, each place it is shown, the pages that
	 * insert it. Empty when it shows nowhere.
	 *
	 * @return string[]
	 */
	public function uses( int $id ): array {
		$uses = array();
		$type = \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::type_of( $id );
		if ( '' !== $type ) {
			$all     = \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::all();
			$summary = \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::describe( $all[ $id ]['conditions'] ?? array() );
			if ( '' !== $summary ) {
				/* translators: 1: header or footer, 2: where it shows, in words */
				$uses[] = sprintf( __( 'as the %1$s on %2$s', 'auvyx-builder' ), 'footer' === $type ? __( 'footer', 'auvyx-builder' ) : __( 'header', 'auvyx-builder' ), $summary );
			}
		}
		foreach ( $this->sanitize_locations( get_post_meta( $id, self::META, true ) ) as $location ) {
			$uses[] = lcfirst( $this->describe( $location ) );
		}
		$pages = count( self::inserted_in( $id ) );
		if ( $pages ) {
			/* translators: %d: number of pages */
			$uses[] = sprintf( _n( 'inserted in %d page', 'inserted in %d pages', $pages, 'auvyx-builder' ), $pages );
		}
		return $uses;
	}

	/** @return array<string, string> Rule id → label: the basic ones, and Auvyx Builder Pro's (`auvyx_builder_location_rules`). */
	public static function rule_labels(): array {
		$labels = array(
			'all'      => __( 'every page', 'auvyx-builder' ),
			'front'    => __( 'the home page', 'auvyx-builder' ),
			'singular' => __( 'every page or post of a kind', 'auvyx-builder' ),
			'ids'      => __( 'the pages I pick', 'auvyx-builder' ),
		);
		/** Display rules Auvyx Builder Pro adds: id → label. */
		$more = apply_filters( 'auvyx_builder_location_rules', array() );
		foreach ( is_array( $more ) ? $more : array() as $id => $label ) {
			if ( in_array( $id, self::RULES, true ) ) {
				$labels[ $id ] = (string) $label;
			}
		}
		return $labels;
	}


	/** Attaches matching components to their locations for this request. */
	public function attach_locations(): void {
		// The canvas of a page shows them as the visitor sees them, around the page being edited (like the header and
		// footer); the canvas of a component or a pattern has no site around it.
		// Nor in Auvyx Studio's preview of a header or footer choice (Modules/ThemeBuilder): it shows the header alone.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence only: nothing is changed.
		if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || isset( $_GET[ VisualBuilder::BARE_PARAM ] ) || isset( $_GET[ \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::PREVIEW . 'header' ] ) || isset( $_GET[ \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::PREVIEW . 'footer' ] ) ) {
			return;
		}
		$by_location = array();
		foreach ( $this->placed() as $id => $locations ) {
			foreach ( $locations as $location ) {
				if ( $this->matches( $location ) ) {
					$by_location[ $location['location'] ][] = $id;
				}
			}
		}
		foreach ( $by_location as $location => $ids ) {
			$this->attach( $location, $ids );
		}
	}

	/**
	 * @param string $location Location id.
	 * @param int[]  $ids      Component ids.
	 */
	private function attach( string $location, array $ids ): void {
		$html            = function () use ( $ids, $location ): string {
			$out   = '';
			$shown = array();
			foreach ( $ids as $id ) {
				$one = $this->render( $id );
				if ( '' !== $one ) {
					$out    .= $one;
					$shown[] = $id;
				}
			}
			// The ids let Auvyx Studio's canvas offer "Edit <component>" on them.
			return '' === $out ? '' : '<div class="auvyx-location auvyx-location--' . esc_attr( str_replace( '_', '-', $location ) ) . '" data-auvyx-components="' . esc_attr( implode( ' ', $shown ) ) . '">' . $out . '</div>';
		};
		$is_main_content = static function (): bool {
			return is_singular() && in_the_loop() && is_main_query() && get_the_ID() === get_queried_object_id();
		};

		switch ( $location ) {
			case 'body_open':
				add_action(
					'wp_body_open',
					static function () use ( $html ) {
						echo $html(); // phpcs:ignore WordPress.Security.EscapeOutput -- rendered blocks.
					}
				);
				break;
			case 'before_content':
			case 'after_content':
				// In the canvas the page's content is the Studio's root: the components go on either side of it.
				// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence only: nothing is changed.
				if ( isset( $_GET[ VisualBuilder::CANVAS_PARAM ] ) ) {
					add_filter(
						'auvyx_builder_canvas_root',
						static function ( $root ) use ( $html, $location ) {
							return 'before_content' === $location ? $html() . $root : $root . $html();
						}
					);
					break;
				}
				add_filter(
					'the_content',
					static function ( $content ) use ( $html, $location, $is_main_content ) {
						if ( ! $is_main_content() ) {
							return $content;
						}
						return 'before_content' === $location ? $html() . $content : $content . $html();
					},
					20
				);
				break;
			case 'after_header':
			case 'before_footer':
				$area = 'after_header' === $location ? 'header' : 'footer';
				add_filter(
					'render_block_core/template-part',
					static function ( $content, $block ) use ( $html, $area ) {
						if ( ( $block['attrs']['slug'] ?? '' ) !== $area && ( $block['attrs']['area'] ?? '' ) !== $area ) {
							return $content;
						}
						return 'header' === $area ? $content . $html() : $html() . $content;
					},
					10,
					2
				);
				break;
			default:
				add_action(
					$location,
					static function () use ( $html ) {
						echo $html(); // phpcs:ignore WordPress.Security.EscapeOutput -- rendered blocks.
					}
				);
		}
	}
}
