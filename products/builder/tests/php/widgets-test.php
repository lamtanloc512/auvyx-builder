<?php
/**
 * Widgets (Modules/Widgets): widgets.js where a marker is used, the map and the breadcrumbs blocks.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Widgets\Widgets;

auvyx_test(
	'widgets: a marker loads widgets.js; a plain element does not',
	static function () {
		wp_dequeue_script( Widgets::HANDLE );
		do_blocks( '<!-- wp:auvyx/text --><p class="wp-block-auvyx-text">Hi</p><!-- /wp:auvyx/text -->' );
		auvyx_assert_same( false, wp_script_is( Widgets::HANDLE, 'enqueued' ) );
		do_blocks( '<!-- wp:auvyx/heading {"className":"auvyx-counter"} --><h3 class="wp-block-auvyx-heading auvyx-counter">98%</h3><!-- /wp:auvyx/heading -->' );
		auvyx_assert_same( true, wp_script_is( Widgets::HANDLE, 'enqueued' ) );
		auvyx_assert_same( true, Widgets::has_marker( 'a auvyx-progress' ) );
		auvyx_assert_same( false, Widgets::has_marker( 'a auvyx-marquee' ), 'a Pro widget is not this module' );
		auvyx_assert_same( false, Widgets::has_marker( 'auvyx-progresss' ) );
		wp_dequeue_script( Widgets::HANDLE );
	}
);

auvyx_test(
	'widgets: the map embeds the address escaped, bounded and lazy',
	static function () {
		$html = do_blocks( '<!-- wp:auvyx/map {"address":"Hoan Kiem \"Lake\" <script>","zoom":99,"height":5} /-->' );
		auvyx_assert_contains( 'https://maps.google.com/maps?q=Hoan%20Kiem%20%22Lake%22', $html );
		auvyx_assert_contains( 'z=21', $html, 'zoom is bounded' );
		auvyx_assert_contains( 'height:160px', $html, 'height is bounded' );
		auvyx_assert_contains( 'loading="lazy"', $html );
		auvyx_assert_not_contains( '<script>', $html );
	}
);

auvyx_test(
	'widgets: breadcrumbs follow the page parents, end on the page, and carry BreadcrumbList data',
	static function () {
		$parent = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Services' ) );
		$child  = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Repairs </script>', 'post_parent' => $parent ) );
		$GLOBALS['wp_query'] = new WP_Query( array( 'page_id' => $child ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		$GLOBALS['wp_the_query'] = $GLOBALS['wp_query']; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		$trail = Widgets::trail( 'Start' );
		auvyx_assert_same( array( 'Start', 'Services', 'Repairs </script>' ), array_column( $trail, 0 ) );
		auvyx_assert_same( '', $trail[2][1], 'the page itself is not a link' );
		$html = do_blocks( '<!-- wp:auvyx/breadcrumbs {"home":"Start","separator":"/"} /-->' );
		auvyx_assert_contains( 'aria-label="Breadcrumb"', $html );
		auvyx_assert_contains( '<span aria-current="page">Repairs &lt;/script&gt;</span>', $html );
		auvyx_assert_contains( '"@type":"BreadcrumbList"', $html );
		auvyx_assert_same( 1, substr_count( $html, '</script>' ), 'nothing typed closes the data early' );
		wp_reset_query();
		wp_delete_post( $child, true );
		wp_delete_post( $parent, true );
	}
);

auvyx_test(
	'widgets: the Studio offers the map and the breadcrumbs with their settings',
	static function () {
		$names = array_column( \Auvyx\Builder\Modules\Studio\Studio::block_types(), 'name' );
		auvyx_assert_same( true, in_array( 'auvyx/map', $names, true ) && in_array( 'auvyx/breadcrumbs', $names, true ), implode( ',', $names ) );
		auvyx_assert_same( false, in_array( 'auvyx/section', $names, true ) );
	}
);
