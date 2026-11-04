<?php
/**
 * Header, footer and other template parts of a block theme in Auvyx Studio (ADR 0028).
 * - A theme's part lives in a file until someone edits it; opening it in Auvyx Studio creates its database copy first,
 *   the way the Site Editor does (through the template-parts REST endpoint), so Studio always edits a post.
 * - Canvas: a page that shows the part, with the edited part replaced by the Studio's root (`auvyx-part` in canvas mode).
 *   The templates using the part decide which page: a product page part opens on a product (the "preview item",
 *   switchable), a catalog part on the shop, anything else on the front page (ADR 0036, phase 3).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

defined( 'ABSPATH' ) || exit;

final class Parts {

	const PARAM = 'auvyx-part';

	/** Admin parameter: the product (or post) a part is previewed with. */
	const PREVIEW = 'auvyx-preview';

	/** Templates whose part opens on a product page, on the shop, or on a post. */
	const PRODUCT_TEMPLATES = array( 'single-product' );
	const CATALOG_TEMPLATES = array( 'archive-product', 'taxonomy-product_cat', 'taxonomy-product_tag', 'product-search-results' );
	const POST_TEMPLATES    = array( 'single' );

	/** Page templates that reach exactly one page, so a part used only by them needs that page as its canvas. */
	const PINNED_PAGE_TEMPLATES = array( 'page-checkout', 'page-cart', 'page-my-account' );


	/** Areas Auvyx Builder lists, in order. */
	const AREAS = array( 'header', 'footer', 'uncategorized' );

	public static function supported(): bool {
		return function_exists( 'wp_is_block_theme' ) && wp_is_block_theme();
	}

	/**
	 * Template parts the active theme shows (header and footer first): its own parts that a template uses. Parts
	 * plugins register (WooCommerce's mini-cart and add-to-cart parts…) and parts no template shows are left out.
	 *
	 * @return \WP_Block_Template[]
	 */
	public static function all(): array {
		if ( ! self::supported() ) {
			return array();
		}
		$theme = get_stylesheet();
		$parts = array_values(
			array_filter(
				get_block_templates( array(), 'wp_template_part' ),
				static fn( $part ) => $theme === $part->theme && in_array( $part->area, self::AREAS, true ) && self::templates_using( $part->slug )
			)
		);
		usort(
			$parts,
			static function ( $a, $b ) {
				$ia = array_search( $a->area, self::AREAS, true );
				$ib = array_search( $b->area, self::AREAS, true );
				return array( false === $ia ? 9 : $ia, $a->title ) <=> array( false === $ib ? 9 : $ib, $b->title );
			}
		);
		return $parts;
	}

	/** `theme//slug` of a wp_template_part post. */
	public static function template_id( \WP_Post $post ): string {
		$terms = get_the_terms( $post, 'wp_theme' );
		$theme = is_array( $terms ) && $terms ? $terms[0]->name : get_stylesheet();
		return $theme . '//' . $post->post_name;
	}

	public static function area( \WP_Post $post ): string {
		$terms = get_the_terms( $post, 'wp_template_part_area' );
		return is_array( $terms ) && $terms ? (string) $terms[0]->name : 'uncategorized';
	}

	/**
	 * The database post of a part, created from the theme file when needed. 0 when the part does not exist.
	 *
	 * @param string $id Template id (`theme//slug`).
	 */
	public static function ensure_post( string $id ): int {
		$template = get_block_template( $id, 'wp_template_part' );
		if ( ! $template ) {
			return 0;
		}
		if ( ! $template->wp_id ) {
			$request = new \WP_REST_Request( 'POST', '/wp/v2/template-parts/' . $id );
			$request->set_param( 'content', $template->content );
			rest_do_request( $request );
			$template = get_block_template( $id, 'wp_template_part' );
		}
		return $template ? (int) $template->wp_id : 0;
	}

	/**
	 * Slugs of the active theme's templates that show a part.
	 *
	 * @param string $slug Part slug.
	 * @return string[]
	 */
	public static function templates_using( string $slug ): array {
		$out = array();
		foreach ( get_block_templates( array(), 'wp_template' ) as $template ) {
			if ( preg_match( '/<!-- wp:template-part \{[^}]*"slug":"' . preg_quote( $slug, '/' ) . '"/', (string) $template->content ) ) {
				$out[] = (string) $template->slug;
			}
		}
		return $out;
	}

	/**
	 * Where a part is shown: product (product page), catalog (shop and product archives), post or site.
	 *
	 * @param \WP_Post $post Template part post.
	 */
	public static function context( \WP_Post $post ): string {
		$used    = self::templates_using( $post->post_name );
		$context = self::context_for( $used, class_exists( 'WooCommerce' ) );
		// A part only on a custom type's item pages (single-kho_xuong) is previewed with one of its items, like a post.
		return 'site' === $context && '' !== self::item_type( $used ) ? 'post' : $context;
	}

	/**
	 * The post type whose item pages show a part: `single` → post, `single-{type}` → that type (not products); '' when the
	 * templates are not all one type's item pages.
	 *
	 * @param string[] $used Templates showing the part.
	 */
	public static function item_type( array $used ): string {
		$types = array_values(
			array_unique(
				array_map(
					static function ( $slug ) {
						return 'single' === $slug ? 'post' : ( 0 === strpos( $slug, 'single-' ) ? substr( $slug, 7 ) : '' );
					},
					$used
				)
			)
		);
		return 1 === count( $types ) && '' !== $types[0] && 'product' !== $types[0] && post_type_exists( $types[0] ) ? $types[0] : '';
	}

	/**
	 * A part belongs to item pages only when every template showing it is one (the header is on product pages too,
	 * but also everywhere else).
	 *
	 * @param string[] $used     Templates showing the part.
	 * @param bool     $commerce WooCommerce is active.
	 */
	public static function context_for( array $used, bool $commerce ): string {
		if ( ! $used ) {
			return 'site';
		}
		// single-product and its layout variants (single-product-layout-grid…, Auvyx Woo's product page presets).
		$product_pages = array_filter( $used, static fn( $slug ) => in_array( $slug, self::PRODUCT_TEMPLATES, true ) || 0 === strpos( $slug, 'single-product-' ) );
		if ( $commerce && count( $product_pages ) === count( $used ) ) {
			return 'product';
		}
		if ( $commerce && ! array_diff( $used, self::CATALOG_TEMPLATES ) ) {
			return 'catalog';
		}
		return array_diff( $used, self::POST_TEMPLATES ) ? 'site' : 'post';
	}

	/**
	 * The item a product-page (or post) part is previewed with: the one asked for, else the latest. 0 elsewhere.
	 *
	 * @param \WP_Post $post Template part post.
	 */
	public static function preview_id( \WP_Post $post ): int {
		$context = self::context( $post );
		$type    = 'product' === $context ? 'product' : ( 'post' === $context ? self::item_type( self::templates_using( $post->post_name ) ) : '' );
		if ( '' === $type ) {
			return 0;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- choosing what to preview with.
		$asked = isset( $_GET[ self::PREVIEW ] ) ? absint( $_GET[ self::PREVIEW ] ) : 0;
		if ( $asked && get_post_type( $asked ) === $type && 'publish' === get_post_status( $asked ) ) {
			return $asked;
		}
		$latest = get_posts(
			array(
				'post_type'      => $type,
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'fields'         => 'ids',
			)
		);
		return $latest ? (int) $latest[0] : 0;
	}

	/**
	 * What Studio offers to preview a part with (latest 50 of its kind), or null for parts shown everywhere.
	 *
	 * @param \WP_Post $post Template part post.
	 * @return array{id: int, kind: string, choices: array<int, array{id: int, title: string}>, url: string}|null
	 */
	public static function preview( \WP_Post $post ): ?array {
		$id = self::preview_id( $post );
		if ( ! $id ) {
			return null;
		}
		$choices = array();
		foreach ( get_posts(
			array(
				'post_type'      => get_post_type( $id ),
				'post_status'    => 'publish',
				'posts_per_page' => 50,
			)
		) as $item ) {
			$choices[] = array(
				'id'    => (int) $item->ID,
				'title' => wp_strip_all_tags( get_the_title( $item ) ),
			);
		}
		if ( ! in_array( $id, wp_list_pluck( $choices, 'id' ), true ) ) {
			array_unshift(
				$choices,
				array(
					'id'    => $id,
					'title' => wp_strip_all_tags( get_the_title( $id ) ),
				)
			);
		}
		return array(
			'id'      => $id,
			'kind'    => (string) get_post_type( $id ),
			'choices' => $choices,
			'url'     => add_query_arg( self::PREVIEW, '{id}', Studio::url( $post->ID ) ),
		);
	}

	/** Canvas: a page that shows the part, in canvas mode, the part marked for replacement. */
	public static function canvas_url( \WP_Post $post ): string {
		$preview = self::preview_id( $post );
		$pinned  = self::page_url_for( $post );
		if ( $preview ) {
			$url = (string) get_permalink( $preview );
		} elseif ( 'catalog' === self::context( $post ) && function_exists( 'wc_get_page_permalink' ) ) {
			$url = (string) wc_get_page_permalink( 'shop' );
		} elseif ( '' !== $pinned ) {
			$url = $pinned;
		} else {
			$url = \Auvyx\Builder\Modules\VisualBuilder\VisualBuilder::canvas_url( $post );
			return '' === $url ? '' : add_query_arg( self::PARAM, rawurlencode( $post->post_name ), $url );
		}
		$url = add_query_arg( \Auvyx\Builder\Modules\VisualBuilder\VisualBuilder::CANVAS_PARAM, wp_create_nonce( \Auvyx\Builder\Modules\VisualBuilder\VisualBuilder::CANVAS_PARAM ), $url );
		return add_query_arg( self::PARAM, rawurlencode( $post->post_name ), $url );
	}

	/**
	 * A page that renders a part used only by page-pinned templates: WooCommerce's own pages first (their template
	 * reaches them through the hierarchy, not through an assignment), then a page assigned the template, then a page
	 * whose slug matches `page-{slug}` (the hierarchy's rule). '' when the part is not pinned to one page.
	 *
	 * @param \WP_Post $post Template part post.
	 */
	private static function page_url_for( \WP_Post $post ): string {
		$used = self::templates_using( $post->post_name );
		// The theme's custom templates (theme.json) are ones any page can choose, so they pin nothing.
		$choosable = \WP_Theme_JSON_Resolver::get_theme_data()->get_custom_templates();
		$pinned    = array();
		foreach ( $used as $template ) {
			if ( in_array( $template, self::PINNED_PAGE_TEMPLATES, true ) ) {
				$pinned[] = $template;
			} elseif ( 0 === strpos( $template, 'page-' ) && ! isset( $choosable[ $template ] ) ) {
				$pinned[] = $template;
			}
		}
		if ( ! $pinned || array_diff( $used, $pinned ) ) {
			return ''; // also shown by a generic template: the usual canvas page shows it in its normal place
		}
		$woo = array(
			'page-checkout'   => 'checkout',
			'page-cart'       => 'cart',
			'page-my-account' => 'myaccount',
		);
		if ( function_exists( 'wc_get_page_id' ) ) {
			foreach ( $pinned as $template ) {
				if ( isset( $woo[ $template ] ) ) {
					$id = (int) wc_get_page_id( $woo[ $template ] );
					if ( $id > 0 && 'publish' === get_post_status( $id ) ) {
						return (string) get_permalink( $id );
					}
				}
			}
		}
		$pages = get_posts(
			array(
				'post_type'      => 'page',
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one page, once
					array(
						'key'     => '_wp_page_template',
						'value'   => $pinned,
						'compare' => 'IN',
					),
				),
			)
		);
		if ( $pages ) {
			return (string) get_permalink( $pages[0] );
		}
		foreach ( $pinned as $template ) {
			$page = get_page_by_path( str_replace( 'page-', '', $template ) );
			if ( $page && 'publish' === $page->post_status ) {
				return (string) get_permalink( $page );
			}
		}
		return '';
	}

	/**
	 * Runs `$build` as if on the part's preview item (global post and product, block context), so WordPress and
	 * WooCommerce blocks in the part render with that product.
	 *
	 * @param \WP_Post $part  Template part post.
	 * @param callable $build What to run.
	 * @return mixed What `$build` returns.
	 */
	public static function with_preview( \WP_Post $part, callable $build ) {
		$id = self::preview_id( $part );
		// The main query too, as on the page that shows the part: WooCommerce's product details, related products and a
		// catalog that follows the page's query read it, not the block context.
		// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below.
		$saved_query = $GLOBALS['wp_query'] ?? null;
		$saved_the   = $GLOBALS['wp_the_query'] ?? null;
		$query       = null;
		if ( $id ) {
			$query = new \WP_Query(
				array(
					'p'         => $id,
					'post_type' => (string) get_post_type( $id ),
				)
			);
		} elseif ( 'catalog' === self::context( $part ) && post_type_exists( 'product' ) ) {
			$query = new \WP_Query(
				array(
					'post_type'      => 'product',
					'post_status'    => 'publish',
					'posts_per_page' => (int) apply_filters( 'loop_shop_per_page', 16 ), // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WooCommerce's filter.
				)
			);
		}
		if ( $query ) {
			$GLOBALS['wp_query']     = $query;
			$GLOBALS['wp_the_query'] = $query;
		}
		// phpcs:enable WordPress.WP.GlobalVariablesOverride.Prohibited
		try {
			return self::with_post( $id, $build );
		} finally {
			if ( $query ) {
				// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited
				$GLOBALS['wp_query']     = $saved_query;
				$GLOBALS['wp_the_query'] = $saved_the;
				// phpcs:enable WordPress.WP.GlobalVariablesOverride.Prohibited
			}
		}
	}

	/**
	 * Runs `$build` with the global post and product of item `$id` and its block context (as is when 0).
	 *
	 * @param int      $id    Item id.
	 * @param callable $build What to run.
	 * @return mixed
	 */
	private static function with_post( int $id, callable $build ) {
		if ( ! $id ) {
			return $build();
		}
		// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited, WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- WooCommerce's globals, restored below.
		$saved_post      = $GLOBALS['post'] ?? null;
		$saved_product   = $GLOBALS['product'] ?? null;
		$GLOBALS['post'] = get_post( $id );
		setup_postdata( $GLOBALS['post'] );
		if ( function_exists( 'wc_get_product' ) && 'product' === get_post_type( $id ) ) {
			$GLOBALS['product'] = wc_get_product( $id );
		}
		try {
			return Studio::with_context(
				array(
					'postId'   => $id,
					'postType' => (string) get_post_type( $id ),
				),
				$build
			);
		} finally {
			$GLOBALS['post']    = $saved_post;
			$GLOBALS['product'] = $saved_product;
			if ( $saved_post instanceof \WP_Post ) {
				setup_postdata( $saved_post );
			}
		}
		// phpcs:enable WordPress.WP.GlobalVariablesOverride.Prohibited, WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
	}

	/**
	 * Canvas mode: the edited part renders as the Studio root inside the part's own wrapper element.
	 *
	 * @param string $slug Part slug.
	 * @param string $root The canvas root marker.
	 */
	public static function replace_in_canvas( string $slug, string $root ): void {
		add_filter(
			'render_block_core/template-part',
			static function ( $content, $block ) use ( $slug, $root ) {
				if ( ( $block['attrs']['slug'] ?? '' ) !== $slug ) {
					return $content;
				}
				$tag = (string) ( $block['attrs']['tagName'] ?? '' );
				if ( ! in_array( $tag, array( 'header', 'footer', 'div', 'section', 'aside', 'main' ), true ) ) {
					$tag = in_array( $slug, array( 'header', 'footer' ), true ) ? $slug : 'div';
				}
				return '<' . $tag . ' class="wp-block-template-part">' . $root . '</' . $tag . '>';
			},
			10,
			2
		);
	}
}
