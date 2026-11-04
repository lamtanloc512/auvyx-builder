<?php
/**
 * Menu builder (Auvyx Studio's Menus panel and the AI agent): the site's navigation menus (wp_navigation posts, what
 * block themes show) as trees of up to three levels, written back as core navigation blocks so the Site Editor and
 * any theme keep working with them. A top-level item can be a mega menu: its second-level items become columns and
 * their own items the links in each column (class `auvyx-mega` on the submenu; Auvyx Theme and Auvyx Navigation lay it out).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

defined( 'ABSPATH' ) || exit;

final class MenuBuilder {

	const DEPTH     = 3;
	const MAX_ITEMS = 60;
	const MEGA      = 'auvyx-mega';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
		add_filter( 'render_block_core/navigation-submenu', array( self::class, 'with_panel' ), 10, 2 );
	}

	/**
	 * A mega menu with a pattern or component chosen for its panel (`auvyxPanel`): it is shown as the panel's last
	 * column (an offer, a picture, a featured product…).
	 *
	 * @param string               $html  Rendered submenu.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public static function with_panel( $html, $block ): string {
		$html  = (string) $html;
		$panel = self::panel_html( (int) ( $block['attrs']['auvyxPanel'] ?? 0 ) );
		$at    = strrpos( $html, '</ul>' );
		if ( '' === $panel || false === $at ) {
			return $html;
		}
		return substr( $html, 0, $at ) . '<li class="wp-block-navigation-item auvyx-mega__panel">' . $panel . '</li>' . substr( $html, $at );
	}

	/** The rendered blocks of a pattern or component (published), '' otherwise. */
	public static function panel_html( int $id ): string {
		static $rendering = array();
		$post             = $id ? get_post( $id ) : null;
		if ( ! $post || 'wp_block' !== $post->post_type || 'publish' !== $post->post_status || isset( $rendering[ $id ] ) ) {
			return '';
		}
		$rendering[ $id ] = true;
		$html             = do_blocks( $post->post_content );
		unset( $rendering[ $id ] );
		return $html;
	}

	public function routes(): void {
		$can = static fn() => current_user_can( 'edit_theme_options' );
		register_rest_route(
			'auvyx/v1',
			'/menus',
			array(
				array(
					'methods'             => 'GET',
					'permission_callback' => $can,
					'callback'            => static fn() => new \WP_REST_Response(
						array(
							'menus'   => self::all(),
							'targets' => self::targets(),
						)
					),
				),
				array(
					'methods'             => 'POST',
					'permission_callback' => $can,
					'callback'            => array( self::class, 'rest_save' ),
				),
			)
		);
	}

	/**
	 * Links inside the site as paths from the domain root ("/shop/"), so a menu survives a domain change; links to
	 * other sites stay whole.
	 */
	public static function relative( string $url ): string {
		$home = wp_parse_url( home_url( '/' ) );
		$link = wp_parse_url( $url );
		if ( ! is_array( $link ) || empty( $link['host'] ) ) {
			return $url;
		}
		$same = is_array( $home ) && strtolower( (string) $link['host'] ) === strtolower( (string) ( $home['host'] ?? '' ) ) && ( $link['port'] ?? null ) === ( $home['port'] ?? null );
		return $same ? wp_make_link_relative( $url ) : $url;
	}

	// ---- reading ------------------------------------------------------------------------------------

	/**
	 * Every navigation menu with its tree.
	 *
	 * @return array<int, array{id: int, title: string, items: array<int, array<string, mixed>>}>
	 */
	public static function all(): array {
		$out = array();
		foreach ( get_posts(
			array(
				'post_type'      => 'wp_navigation',
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => 30,
				'orderby'        => 'date',
				'order'          => 'ASC',
			)
		) as $nav ) {
			$out[] = array(
				'id'    => (int) $nav->ID,
				'title' => '' !== $nav->post_title ? $nav->post_title : __( 'Navigation', 'auvyx-builder' ),
				'items' => self::tree( parse_blocks( $nav->post_content ) ),
			);
		}
		return $out;
	}

	/**
	 * Navigation blocks → items: label, url, what they link to (kind/type/id), mega, description, children.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, array<string, mixed>>
	 */
	public static function tree( array $blocks, int $depth = 1 ): array {
		$out = array();
		foreach ( $blocks as $block ) {
			$name  = (string) ( $block['blockName'] ?? '' );
			$attrs = (array) ( $block['attrs'] ?? array() );
			if ( ! in_array( $name, array( 'core/navigation-link', 'core/navigation-submenu', 'core/home-link' ), true ) ) {
				continue;
			}
			$item  = array(
				'label'       => wp_strip_all_tags( (string) ( $attrs['label'] ?? ( 'core/home-link' === $name ? __( 'Home', 'auvyx-builder' ) : '' ) ) ),
				'url'         => self::relative( 'core/home-link' === $name ? home_url( '/' ) : (string) ( $attrs['url'] ?? '' ) ),
				'kind'        => (string) ( $attrs['kind'] ?? 'custom' ),
				'type'        => (string) ( $attrs['type'] ?? '' ),
				'id'          => (int) ( $attrs['id'] ?? 0 ),
				'description' => (string) ( $attrs['description'] ?? '' ),
				'mega'        => 1 === $depth && false !== strpos( ' ' . ( $attrs['className'] ?? '' ) . ' ', ' ' . self::MEGA . ' ' ),
				'panel'       => 1 === $depth ? (int) ( $attrs['auvyxPanel'] ?? 0 ) : 0,
				'children'    => $depth < self::DEPTH ? self::tree( (array) ( $block['innerBlocks'] ?? array() ), $depth + 1 ) : array(),
			);
			$out[] = $item;
		}
		return $out;
	}

	/**
	 * What links can point at: pages, product categories, post categories (title, url, kind/type/id).
	 *
	 * @return array<int, array{label: string, url: string, kind: string, type: string, id: int, group: string}>
	 */
	public static function targets(): array {
		$out = array(
			array(
				'label' => __( 'Home', 'auvyx-builder' ),
				'url'   => self::relative( home_url( '/' ) ),
				'kind'  => 'custom',
				'type'  => '',
				'id'    => 0,
				'group' => __( 'Pages', 'auvyx-builder' ),
			),
		);
		foreach ( get_pages(
			array(
				'sort_column' => 'menu_order,post_title',
				'number'      => 80,
			)
		) as $page ) {
			// Pages made from a site template are grouped by it: templates give pages the same names.
			$origin = (string) get_post_meta( $page->ID, \Auvyx\Builder\Modules\SiteTemplates\SiteTemplates::ORIGIN, true );
			$out[]  = array(
				'label' => html_entity_decode( wp_strip_all_tags( get_the_title( $page ) ), ENT_QUOTES, 'UTF-8' ),
				'url'   => self::relative( (string) get_permalink( $page ) ),
				'kind'  => 'post-type',
				'type'  => 'page',
				'id'    => (int) $page->ID,
				/* translators: %s: site template name. */
				'group' => '' === $origin ? __( 'Pages', 'auvyx-builder' ) : sprintf( __( 'Pages · %s', 'auvyx-builder' ), $origin ),
			);
		}
		foreach ( array(
			'product_cat' => __( 'Product categories', 'auvyx-builder' ),
			'category'    => __( 'Categories', 'auvyx-builder' ),
		) as $taxonomy => $group ) {
			if ( ! taxonomy_exists( $taxonomy ) ) {
				continue;
			}
			$terms = get_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => true,
					'number'     => 80,
				)
			);
			foreach ( is_array( $terms ) ? $terms : array() as $term ) {
				$link = get_term_link( $term );
				if ( is_wp_error( $link ) ) {
					continue;
				}
				$out[] = array(
					'label' => html_entity_decode( $term->name, ENT_QUOTES, 'UTF-8' ),
					'url'   => self::relative( (string) $link ),
					'kind'  => 'taxonomy',
					'type'  => $taxonomy,
					'id'    => (int) $term->term_id,
					'group' => $group,
				);
			}
		}
		return $out;
	}

	// ---- writing ------------------------------------------------------------------------------------

	/**
	 * Saves a menu: `id` (0 = a new one), `title`, `items` (the tree). Answers with the saved menu.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_save( $request ) {
		$items = $request->get_param( 'items' );
		if ( ! is_array( $items ) ) {
			return new \WP_Error( 'auvyx_menu_items', __( 'A menu needs its items.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$id = self::save( (int) $request->get_param( 'id' ), (string) $request->get_param( 'title' ), $items );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		foreach ( self::all() as $menu ) {
			if ( $menu['id'] === $id ) {
				return new \WP_REST_Response( $menu );
			}
		}
		return new \WP_Error( 'auvyx_menu_missing', __( 'The menu was not saved.', 'auvyx-builder' ), array( 'status' => 500 ) );
	}

	/**
	 * Writes items as navigation blocks into menu `$id` (or a new menu). Returns its id.
	 *
	 * @param int                              $id    Menu (wp_navigation) id, 0 for a new one.
	 * @param string                           $title Title ('' keeps it).
	 * @param array<int, array<string, mixed>> $items Tree.
	 * @return int|\WP_Error
	 */
	public static function save( int $id, string $title, array $items ) {
		$count = 0;
		// wp_insert_post/wp_update_post unslash what they get: the JSON escapes in block comments (\u0026…) need slashes.
		$content = wp_slash( serialize_blocks( self::blocks( $items, 1, $count ) ) );
		$title   = sanitize_text_field( $title );
		if ( $id ) {
			$post = get_post( $id );
			if ( ! $post || 'wp_navigation' !== $post->post_type ) {
				return new \WP_Error( 'auvyx_menu_unknown', __( 'This menu does not exist.', 'auvyx-builder' ), array( 'status' => 404 ) );
			}
			$result = wp_update_post(
				array_filter(
					array(
						'ID'           => $id,
						'post_content' => $content,
						'post_title'   => $title,
					)
				),
				true
			);
		} else {
			$result = wp_insert_post(
				array(
					'post_type'    => 'wp_navigation',
					'post_status'  => 'publish',
					'post_title'   => '' !== $title ? $title : __( 'Menu', 'auvyx-builder' ),
					'post_content' => $content,
				),
				true
			);
		}
		return is_wp_error( $result ) ? $result : (int) $result;
	}

	/**
	 * Items → parsed navigation blocks (labels and urls cleaned, depth and count limited).
	 *
	 * @param array<int, mixed> $items Tree.
	 * @param int               $depth Level (1 = top).
	 * @param int               $count Items written so far.
	 * @return array<int, array<string, mixed>>
	 */
	private static function blocks( array $items, int $depth, int &$count ): array {
		$out = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) || $count >= self::MAX_ITEMS ) {
				continue;
			}
			$label = sanitize_text_field( (string) ( $item['label'] ?? '' ) );
			if ( '' === $label ) {
				continue;
			}
			++$count;
			$attrs = array(
				'label' => $label,
				'url'   => esc_url_raw( self::relative( (string) ( $item['url'] ?? '' ) ) ),
			);
			$kind  = (string) ( $item['kind'] ?? 'custom' );
			if ( in_array( $kind, array( 'post-type', 'taxonomy' ), true ) && ! empty( $item['id'] ) ) {
				$attrs['kind'] = $kind;
				$attrs['type'] = sanitize_key( (string) ( $item['type'] ?? '' ) );
				$attrs['id']   = (int) $item['id'];
			} else {
				$attrs['kind'] = 'custom';
			}
			$description = sanitize_text_field( (string) ( $item['description'] ?? '' ) );
			if ( '' !== $description ) {
				$attrs['description'] = $description;
			}
			$children = $depth < self::DEPTH && ! empty( $item['children'] ) && is_array( $item['children'] ) ? self::blocks( $item['children'], $depth + 1, $count ) : array();
			if ( $children ) {
				if ( 1 === $depth && ! empty( $item['mega'] ) ) {
					$attrs['className'] = self::MEGA;
					if ( ! empty( $item['panel'] ) && 'wp_block' === get_post_type( (int) $item['panel'] ) ) {
						$attrs['auvyxPanel'] = (int) $item['panel'];
					}
				}
				$out[] = array(
					'blockName'    => 'core/navigation-submenu',
					'attrs'        => $attrs,
					'innerBlocks'  => $children,
					'innerHTML'    => '',
					'innerContent' => array_fill( 0, count( $children ), null ),
				);
			} else {
				if ( 1 === $depth ) {
					$attrs['isTopLevelLink'] = true;
				}
				$out[] = array(
					'blockName'    => 'core/navigation-link',
					'attrs'        => $attrs,
					'innerBlocks'  => array(),
					'innerHTML'    => '',
					'innerContent' => array(),
				);
			}
		}
		return $out;
	}
}
