<?php
/**
 * Menus an Auvyx Navigation can show: the site's pages, a block-theme navigation (wp_navigation) or a classic menu.
 * Up to three levels: top-level links, their submenu, and inside a mega menu (a top item marked `mega`) the columns'
 * links (Auvyx Studio's Menus panel writes them, see Studio\MenuBuilder).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Data;

defined( 'ABSPATH' ) || exit;

final class Menus {

	const MAX_ITEMS = 12;

	/**
	 * Every source with its items, for Auvyx Studio.
	 *
	 * @return array<int, array{id: string, label: string, items: array<int, array{label: string, url: string}>}>
	 */
	public static function sources(): array {
		$out  = array(
			array(
				'id'    => 'pages',
				'label' => __( 'Pages', 'auvyx-builder' ),
				'items' => self::items( 'pages' ),
			),
		);
		$navs = get_posts(
			array(
				'post_type'      => 'wp_navigation',
				'post_status'    => 'publish',
				'posts_per_page' => 20,
			)
		);
		foreach ( $navs as $nav ) {
			$out[] = array(
				'id'    => 'nav:' . $nav->ID,
				'label' => '' !== $nav->post_title ? $nav->post_title : __( 'Navigation', 'auvyx-builder' ),
				'items' => self::items( 'nav:' . $nav->ID ),
			);
		}
		foreach ( wp_get_nav_menus() as $menu ) {
			$out[] = array(
				'id'    => 'menu:' . $menu->term_id,
				'label' => $menu->name,
				'items' => self::items( 'menu:' . $menu->term_id ),
			);
		}
		return $out;
	}

	/**
	 * Links of a source (`pages`, `nav:<id>`, `menu:<term id>`); unknown sources show the pages. Each link may have
	 * `children` (one level).
	 *
	 * @param string $source Source id.
	 * @return array<int, array{label: string, url: string, children?: array<int, array{label: string, url: string}>}>
	 */
	public static function items( string $source ): array {
		$items = array();
		if ( preg_match( '/^nav:(\d+)$/', $source, $m ) ) {
			$nav = get_post( (int) $m[1] );
			if ( $nav && 'wp_navigation' === $nav->post_type && 'publish' === $nav->post_status ) {
				$items = self::from_tree( \Auvyx\Builder\Modules\Studio\MenuBuilder::tree( parse_blocks( $nav->post_content ) ) );
				if ( ! $items ) {
					$items = self::from_blocks( parse_blocks( $nav->post_content ) ); // a page list…
				}
			}
		} elseif ( preg_match( '/^menu:(\d+)$/', $source, $m ) ) {
			$all = array_filter( (array) wp_get_nav_menu_items( (int) $m[1] ), static fn( $i ) => $i instanceof \WP_Post );
			foreach ( $all as $item ) {
				if ( 0 !== (int) $item->menu_item_parent ) {
					continue;
				}
				$children = array();
				foreach ( $all as $child ) {
					if ( (int) $child->menu_item_parent === (int) $item->ID ) {
						$children[] = self::link( (string) $child->title, (string) $child->url );
					}
				}
				$items[] = self::link( (string) $item->title, (string) $item->url, $children );
			}
		} else {
			$items = self::pages();
		}
		return array_slice( $items, 0, self::MAX_ITEMS );
	}

	/**
	 * @param array<int, array{label: string, url: string}> $children Submenu.
	 * @return array{label: string, url: string, children?: array<int, array{label: string, url: string}>}
	 */
	private static function link( string $label, string $url, array $children = array() ): array {
		$link = array(
			'label' => wp_strip_all_tags( $label ),
			'url'   => $url,
		);
		if ( $children ) {
			$link['children'] = array_slice( $children, 0, self::MAX_ITEMS );
		}
		return $link;
	}

	/** @return array<int, array<string, mixed>> */
	private static function pages(): array {
		$out   = array();
		$pages = get_pages(
			array(
				'sort_column' => 'menu_order,post_title',
				'number'      => 60,
			)
		);
		foreach ( (array) $pages as $page ) {
			if ( 0 !== (int) $page->post_parent ) {
				continue;
			}
			$children = array();
			foreach ( (array) $pages as $child ) {
				if ( (int) $child->post_parent === (int) $page->ID ) {
					$children[] = self::link( get_the_title( $child ), (string) get_permalink( $child ) );
				}
			}
			$out[] = self::link( get_the_title( $page ), (string) get_permalink( $page ), $children );
		}
		return $out;
	}

	/**
	 * Menu builder items → links (three levels, `mega` on top items).
	 *
	 * @param array<int, array<string, mixed>> $tree Items.
	 * @return array<int, array<string, mixed>>
	 */
	private static function from_tree( array $tree ): array {
		$out = array();
		foreach ( $tree as $item ) {
			$link = self::link( (string) $item['label'], (string) $item['url'], self::from_tree( (array) $item['children'] ) );
			if ( ! empty( $item['mega'] ) && ! empty( $link['children'] ) ) {
				$link['mega'] = true;
				if ( ! empty( $item['panel'] ) ) {
					$link['panel'] = (int) $item['panel'];
				}
			}
			$out[] = $link;
		}
		return $out;
	}

	/**
	 * Top-level links of a wp_navigation's blocks.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, array{label: string, url: string}>
	 */
	private static function from_blocks( array $blocks ): array {
		$out = array();
		foreach ( $blocks as $block ) {
			$name  = (string) ( $block['blockName'] ?? '' );
			$attrs = (array) ( $block['attrs'] ?? array() );
			if ( 'core/navigation-link' === $name ) {
				$out[] = self::link( (string) ( $attrs['label'] ?? '' ), (string) ( $attrs['url'] ?? '' ) );
			} elseif ( 'core/navigation-submenu' === $name ) {
				$children = array_map(
					static fn( $c ) => array(
						'label' => $c['label'],
						'url'   => $c['url'],
					),
					self::from_blocks( (array) ( $block['innerBlocks'] ?? array() ) )
				);
				$out[]    = self::link( (string) ( $attrs['label'] ?? '' ), (string) ( $attrs['url'] ?? '' ), $children );
			} elseif ( 'core/home-link' === $name ) {
				$out[] = array(
					'label' => wp_strip_all_tags( (string) ( $attrs['label'] ?? __( 'Home', 'auvyx-builder' ) ) ),
					'url'   => home_url( '/' ),
				);
			} elseif ( 'core/page-list' === $name ) {
				$out = array_merge( $out, self::pages() );
			}
		}
		return $out;
	}
}
