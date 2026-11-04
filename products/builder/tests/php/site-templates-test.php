<?php
/**
 * Site templates: storage, built-in folders, the checks the server makes, the site snapshot, front page.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Blocks\Markup;
use Auvyx\Builder\Modules\SiteTemplates\SiteTemplates;

function auvyx_site_template_json( string $id, string $title = 'Demo' ): string {
	return (string) wp_json_encode(
		array(
			'schema' => 'auvyx-site/1',
			'id'     => $id,
			'title'  => $title,
			'pages'  => array(
				array(
					'key'      => 'home',
					'title'    => 'Home',
					'front'    => true,
					'elements' => array( array( 'kind' => 'heading', 'text' => 'A & B <em>"quoted"</em> \u00e9' ) ),
				),
			),
		),
		JSON_UNESCAPED_SLASHES
	);
}

auvyx_test(
	'site templates: save keeps the JSON byte for byte, lists, replaces, deletes',
	static function () {
		wp_set_current_user( 1 );
		$json  = auvyx_site_template_json( 'auvyx-test-shop', 'Test shop' );
		$saved = SiteTemplates::save( $json );
		auvyx_assert_same( 'auvyx-test-shop', $saved['id'] );
		auvyx_assert_same( false, $saved['builtIn'] );
		auvyx_assert_same( $json, SiteTemplates::json( 'auvyx-test-shop' ), 'escapes and HTML survive storage' );
		auvyx_assert_same( array( 'Home' ), array_values( array_filter( SiteTemplates::summaries(), static fn( $s ) => 'auvyx-test-shop' === $s['id'] ) )[0]['pages'] );

		SiteTemplates::save( auvyx_site_template_json( 'auvyx-test-shop', 'Renamed' ) );
		$mine = array_values( array_filter( SiteTemplates::summaries(), static fn( $s ) => 'auvyx-test-shop' === $s['id'] ) );
		auvyx_assert_same( 1, count( $mine ), 'replaced, not duplicated' );
		auvyx_assert_same( 'Renamed', $mine[0]['title'] );

		auvyx_assert_same( true, SiteTemplates::delete( 'auvyx-test-shop' ) );
		auvyx_assert_same( '', SiteTemplates::json( 'auvyx-test-shop' ) );
		auvyx_assert_same( true, is_wp_error( SiteTemplates::delete( 'auvyx-test-shop' ) ) );
	}
);

auvyx_test(
	'site templates: the server refuses what is not a template',
	static function () {
		auvyx_assert_same( true, is_wp_error( SiteTemplates::validate( 'nope' ) ) );
		$bad = SiteTemplates::validate( '{"schema":"auvyx-site/9","id":"Bad Id","title":"","pages":[]}' );
		auvyx_assert_same( true, is_wp_error( $bad ) );
		foreach ( array( 'schema', 'id:', 'title is empty', 'pages:' ) as $part ) {
			auvyx_assert_contains( $part, $bad->get_error_message() );
		}
	}
);

auvyx_test(
	'site templates: built-in folders list, the site\'s copy wins, built-ins cannot be deleted',
	static function () {
		wp_set_current_user( 1 );
		auvyx_assert_same( array(), SiteTemplates::built_in(), 'Auvyx Builder ships no site templates of its own' );
		$dir = get_temp_dir() . 'auvyx-site-templates-test';
		wp_mkdir_p( $dir );
		file_put_contents( $dir . '/auvyx-builtin-demo.json', auvyx_site_template_json( 'auvyx-builtin-demo', 'Built in' ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		$dirs = static fn( $d ) => array_merge( $d, array( $dir ) );
		add_filter( 'auvyx_builder_site_template_dirs', $dirs );

		$built = array_values( array_filter( SiteTemplates::summaries(), static fn( $s ) => 'auvyx-builtin-demo' === $s['id'] ) );
		auvyx_assert_same( true, $built[0]['builtIn'] );
		auvyx_assert_same( 403, SiteTemplates::delete( 'auvyx-builtin-demo' )->get_error_data()['status'] );
		// A theme's template is never Pro: it opens without a licence.
		auvyx_assert_same( 200, rest_do_request( new WP_REST_Request( 'GET', '/auvyx/v1/site-templates/auvyx-builtin-demo' ) )->get_status() );

		SiteTemplates::save( auvyx_site_template_json( 'auvyx-builtin-demo', 'My copy' ) );
		$both = array_values( array_filter( SiteTemplates::summaries(), static fn( $s ) => 'auvyx-builtin-demo' === $s['id'] ) );
		auvyx_assert_same( 1, count( $both ) );
		auvyx_assert_same( 'My copy', $both[0]['title'] );
		SiteTemplates::delete( 'auvyx-builtin-demo' );
		auvyx_assert_same( 'Built in', json_decode( SiteTemplates::json( 'auvyx-builtin-demo' ), true )['title'], 'back to the built-in' );

		remove_filter( 'auvyx_builder_site_template_dirs', $dirs );
		unlink( $dir . '/auvyx-builtin-demo.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
	}
);

auvyx_test(
	'site templates: the site snapshot has pages as Studio trees; the front page can be set',
	static function () {
		wp_set_current_user( 1 );
		$page = wp_insert_post(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_title'   => 'Snapshot page',
				'post_content' => Markup::section( array( Markup::heading( 'Hi', 2 ) ) ),
			)
		);
		$site = SiteTemplates::site();
		$mine = array_values( array_filter( $site['pages'], static fn( $p ) => $page === $p['id'] ) );
		auvyx_assert_same( 'auvyx/section', $mine[0]['blocks'][0]['block'] );
		auvyx_assert_same( (string) get_permalink( $page ), $mine[0]['url'] );

		$request = new WP_REST_Request( 'POST', '/auvyx/v1/site-templates/front' );
		$request->set_param( 'page', $page );
		auvyx_assert_same( 200, rest_do_request( $request )->get_status() );
		auvyx_assert_same( $page, (int) get_option( 'page_on_front' ) );
		auvyx_assert_same( 'page', get_option( 'show_on_front' ) );
		update_option( 'show_on_front', 'posts' );
		wp_delete_post( $page, true );
	}
);

auvyx_test(
	'site templates: REST needs a user who may change the site\'s design',
	static function () {
		wp_set_current_user( 0 );
		auvyx_assert_same( 401, rest_do_request( new WP_REST_Request( 'GET', '/auvyx/v1/site-templates' ) )->get_status() );
		wp_set_current_user( 1 );
		$response = rest_do_request( new WP_REST_Request( 'GET', '/auvyx/v1/site-templates' ) );
		auvyx_assert_same( 200, $response->get_status() );
	}
);

auvyx_test(
	'site templates: the header goes to the part every page shows, not to another header-area part',
	static function () {
		wp_set_current_user( 1 );
		if ( ! wp_is_block_theme() ) {
			return;
		}
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/site-templates/part' );
		$request->set_param( 'area', 'header' );
		$request->set_param( 'content', '<!-- wp:paragraph --><p>New header</p><!-- /wp:paragraph -->' );
		$response = rest_do_request( $request );
		auvyx_assert_same( 200, $response->get_status() );
		auvyx_assert_same( get_stylesheet() . '//header', $response->get_data()['part'] );
		auvyx_assert_contains( 'New header', get_block_template( get_stylesheet() . '//header', 'wp_template_part' )->content );
	}
);

auvyx_test(
	'site templates: a page made from one names it in the pages list, and REST sets it',
	static function () {
		wp_set_current_user( 1 );
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'Home', 'post_status' => 'publish' ) );
		$request = new WP_REST_Request( 'POST', '/wp/v2/pages/' . $page );
		$request->set_body_params( array( 'meta' => array( SiteTemplates::ORIGIN => '<b>Bakery</b> shop' ) ) );
		auvyx_assert_same( 200, rest_do_request( $request )->get_status() );
		auvyx_assert_same( 'Bakery shop', get_post_meta( $page, SiteTemplates::ORIGIN, true ), 'sanitized' );
		$states = apply_filters( 'display_post_states', array(), get_post( $page ) );
		auvyx_assert_same( 'From template: Bakery shop', $states['auvyx_from_template'] );
		$plain = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'Other', 'post_status' => 'publish' ) );
		auvyx_assert_same( array(), apply_filters( 'display_post_states', array(), get_post( $plain ) ) );
		wp_delete_post( $page, true );
		wp_delete_post( $plain, true );
	}
);
