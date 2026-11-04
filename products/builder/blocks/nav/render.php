<?php
/**
 * Auvyx Navigation: links as a bar (submenus drop down on hover and focus); on small screens (toggleAt, from the design
 * system breakpoints) a menu button opens them, with <details> (no JS).
 * The links are printed twice (bar and panel); only one is displayed, so assistive tech reads them once.
 *
 * @package Auvyx\Builder
 * @var array<string, mixed> $attributes
 */

use Auvyx\Builder\Modules\Data\Menus;

defined( 'ABSPATH' ) || exit;

$auvyx_builder_toggle = in_array( $attributes['toggleAt'] ?? 'mobile', array( 'mobile', 'tablet', 'never' ), true ) ? $attributes['toggleAt'] : 'mobile';
$auvyx_builder_items  = Menus::items( is_string( $attributes['source'] ?? null ) ? $attributes['source'] : 'pages' );
global $wp;
// The current page as a path: menu links inside the site are saved as paths ("/shop/"), older ones whole.
$auvyx_builder_here = untrailingslashit( wp_make_link_relative( home_url( isset( $wp->request ) ? (string) $wp->request : '' ) ) );

$auvyx_builder_link = static function ( array $item ) use ( $auvyx_builder_here ): string {
	return sprintf(
		'<a href="%1$s"%2$s>%3$s</a>',
		esc_url( $item['url'] ),
		untrailingslashit( wp_make_link_relative( $item['url'] ) ) === $auvyx_builder_here ? ' aria-current="page"' : '',
		esc_html( $item['label'] )
	);
};
// Lists of links; a submenu opens on hover and keyboard focus (bar) and is always open in the menu panel. A mega item's
// submenu is a panel of columns: each second-level item heads a column of its own links.
$auvyx_builder_list  = static function ( array $items, int $depth ) use ( &$auvyx_builder_list, $auvyx_builder_link ): string {
	$out = '';
	foreach ( $items as $item ) {
		if ( empty( $item['children'] ) ) {
			$out .= '<li>' . $auvyx_builder_link( $item ) . '</li>';
			continue;
		}
		$mega  = 1 === $depth && ! empty( $item['mega'] );
		$class = 1 === $depth ? 'auvyx-nav__parent' . ( $mega ? ' auvyx-nav__mega' : '' ) : 'auvyx-nav__group';
		$sub   = 1 === $depth ? 'auvyx-nav__sub' : 'auvyx-nav__subsub';
		$panel = $mega && ! empty( $item['panel'] ) ? \Auvyx\Builder\Modules\Studio\MenuBuilder::panel_html( (int) $item['panel'] ) : '';
		$out  .= '<li class="' . $class . '">' . $auvyx_builder_link( $item ) . '<ul class="' . $sub . '">' . $auvyx_builder_list( $item['children'], $depth + 1 ) . ( '' !== $panel ? '<li class="auvyx-nav__panelcol">' . $panel . '</li>' : '' ) . '</ul></li>';
	}
	return $out;
};
$auvyx_builder_links = $auvyx_builder_list( $auvyx_builder_items, 1 );

// A department menu (NavDept: auvyx-nav-dept) is one labelled button over the list, as the Studio draws it.
$auvyx_builder_dept        = 1 === preg_match( '/(^|\s)auvyx-nav-dept(\s|$)/', (string) ( $attributes['className'] ?? '' ) );
$auvyx_builder_toggle_html = $auvyx_builder_dept
	? '<summary class="auvyx-nav__toggle auvyx-nav__dept">' . esc_html__( 'Shop by categories', 'auvyx-builder' ) . '</summary>'
	: '<summary class="auvyx-nav__toggle" aria-label="' . esc_attr__( 'Menu', 'auvyx-builder' ) . '"><span></span></summary>';

printf(
	'<nav %1$s><ul class="auvyx-nav__list">%2$s</ul><details class="auvyx-nav__menu">%3$s<ul class="auvyx-nav__panel">%2$s</ul></details></nav>',
	get_block_wrapper_attributes( // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
		array(
			'class'      => 'auvyx-nav--toggle-' . $auvyx_builder_toggle,
			'aria-label' => __( 'Menu', 'auvyx-builder' ),
		)
	),
	$auvyx_builder_links, // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above.
	$auvyx_builder_toggle_html // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above.
);
