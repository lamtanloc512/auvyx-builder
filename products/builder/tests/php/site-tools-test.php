<?php
/**
 * Site tools (Modules/SiteTools): coming soon / maintenance.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\SiteTools\SiteTools;

auvyx_test(
	'site tools: the mode and page are checked',
	static function () {
		$s = SiteTools::sanitize( array( 'mode' => 'coming_soon', 'page' => 999999, 'message' => '<b>Soon</b>' ) );
		auvyx_assert_same( 'coming_soon', $s['mode'] );
		auvyx_assert_same( 0, $s['page'], 'a page that does not exist is none' );
		auvyx_assert_same( 'Soon', $s['message'] );
		auvyx_assert_same( 'off', SiteTools::sanitize( array( 'mode' => 'nonsense' ) )['mode'] );
	}
);

auvyx_test(
	'site tools: with nothing saved the site is public',
	static function () {
		delete_option( SiteTools::OPTION );
		auvyx_assert_same( 'off', SiteTools::settings()['mode'] );
		auvyx_assert_same( 'off', SiteTools::sanitize( array() )['mode'] );
	}
);

auvyx_test(
	'site tools: visitors get the chosen page or the message; editors pass',
	static function () {
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Soon', 'post_content' => '<!-- wp:paragraph --><p>Opening in May</p><!-- /wp:paragraph -->' ) );
		$html = SiteTools::screen( array( 'mode' => 'coming_soon', 'page' => $page, 'message' => '' ) );
		auvyx_assert_contains( 'Opening in May', $html );
		auvyx_assert_contains( 'noindex', $html, 'coming soon is not indexed' );
		$html = SiteTools::screen( array( 'mode' => 'maintenance', 'page' => 0, 'message' => "Back <b>soon</b>\nPromise" ) );
		auvyx_assert_contains( 'Back &lt;b&gt;soon&lt;/b&gt;<br />', $html );
		auvyx_assert_not_contains( 'noindex', $html );
		$was = get_current_user_id();
		wp_set_current_user( 0 );
		auvyx_assert_same( false, SiteTools::bypass() );
		wp_set_current_user( 1 );
		auvyx_assert_same( true, SiteTools::bypass() );
		wp_set_current_user( $was );
		wp_delete_post( $page, true );
	}
);
