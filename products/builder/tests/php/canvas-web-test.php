<?php
/**
 * Auvyx Studio's web canvas on WordPress (Modules/CanvasWeb, docs/canvas-renderer.md "WordPress"): marks, the render
 * endpoint, and the builders' markers kept out of visitor HTML (Modules/Header).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\CanvasWeb\CanvasWeb;

/** A section holding a heading and a section with a text: three levels, five elements with the outer section. */
function auvyx_canvas_web_markup(): string {
	return "<!-- wp:auvyx/section -->\n<section class=\"wp-block-auvyx-section\"><!-- wp:auvyx/heading -->\n<h2 class=\"wp-block-auvyx-heading\">Hi</h2>\n<!-- /wp:auvyx/heading -->\n\n"
		. "<!-- wp:auvyx/section {\"auvyx\":{\"v\":1,\"styles\":{\"base\":{\"default\":{\"gap\":\"8px\"}}}}} -->\n<section class=\"wp-block-auvyx-section\"><!-- wp:auvyx/text -->\n<p class=\"wp-block-auvyx-text\">One</p>\n<!-- /wp:auvyx/text --></section>\n<!-- /wp:auvyx/section --></section>\n<!-- /wp:auvyx/section -->\n\n"
		. "<!-- wp:auvyx/divider -->\n<hr class=\"wp-block-auvyx-divider\"/>\n<!-- /wp:auvyx/divider -->";
}

auvyx_test(
	'canvas web: positions in pre-order, into Studio containers only, whitespace skipped',
	static function () {
		$html = do_blocks( CanvasWeb::annotate( auvyx_canvas_web_markup(), 'content' ) );
		preg_match_all( '/data-auvyx-path="([^"]+)"/', $html, $m );
		auvyx_assert_same( array( 'content/0', 'content/0.0', 'content/0.1', 'content/0.1.0', 'content/1' ), $m[1] );
		auvyx_assert_not_contains( 'data-auvyx-id', $html, 'positions only on the parity page' );
		auvyx_assert_not_contains( 'auvyxCanvas', $html );
	}
);

auvyx_test(
	'canvas web: Studio ids and paths go on each element\'s first tag; plain renders carry nothing',
	static function () {
		$ids   = array( 'n1', 'n2', 'n3', 'n4', 'n5' );
		$paths = array( 'header/0', 'header/0.0', 'header/0.1', 'header/0.1.0', 'header/1' );
		$html  = do_blocks( CanvasWeb::annotate( auvyx_canvas_web_markup(), 'canvas', $ids, $paths ) );
		auvyx_assert_contains( '<section data-auvyx-id="n1" data-auvyx-path="header/0" class="wp-block-auvyx-section">', $html );
		auvyx_assert_contains( '<h2 data-auvyx-id="n2" data-auvyx-path="header/0.0"', $html );
		auvyx_assert_contains( 'data-auvyx-id="n4" data-auvyx-path="header/0.1.0"', $html );
		auvyx_assert_contains( '<hr data-auvyx-id="n5"', $html );
		// the style class is still added (Styles), on the same tag
		auvyx_assert_same( 1, preg_match( '/<section data-auvyx-id="n3" data-auvyx-path="header\/0\.1" class="wp-block-auvyx-section auvyx-[a-z0-9]+"/', $html ) );
		$plain = do_blocks( auvyx_canvas_web_markup() );
		auvyx_assert_not_contains( 'data-auvyx-', $plain );
		// fewer ids than elements: the rest is drawn unmarked, never with a wrong id
		$short = do_blocks( CanvasWeb::annotate( auvyx_canvas_web_markup(), 'canvas', array( 'a1' ), array( 'content/0' ) ) );
		auvyx_assert_same( 1, substr_count( $short, 'data-auvyx-id=' ) );
	}
);

auvyx_test(
	'canvas web: ids and paths are validated',
	static function () {
		auvyx_assert_same( true, null !== CanvasWeb::valid_marks( array( 'n1', 'a~b' ), array( 'content/0', 'header/2.13' ) ) );
		auvyx_assert_same( null, CanvasWeb::valid_marks( array( 'n1' ), array() ), 'as many paths as ids' );
		auvyx_assert_same( null, CanvasWeb::valid_marks( array( 'x"><script>' ), array( 'content/0' ) ) );
		auvyx_assert_same( null, CanvasWeb::valid_marks( array( 'n1' ), array( 'content/0"' ) ) );
		auvyx_assert_same( null, CanvasWeb::valid_marks( 'n1', array( 'content/0' ) ) );
	}
);

auvyx_test(
	'canvas web: the render endpoint draws as the page does, for editors of the post only, never cached',
	static function () {
		$admin  = get_users( array( 'role' => 'administrator' ) )[0];
		$author = wp_insert_user(
			array(
				'user_login' => 'auvyx-canvas-author',
				'user_pass'  => wp_generate_password(),
				'role'       => 'author',
			)
		);
		$post   = wp_insert_post(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_title'   => 'Canvas',
				'post_author'  => $admin->ID,
				'post_content' => auvyx_canvas_web_markup(),
			)
		);
		$call   = static function ( array $body ) {
			$request = new WP_REST_Request( 'POST', '/auvyx/v1/canvas/render' );
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
			return rest_do_request( $request );
		};
		$body   = array(
			'post'   => $post,
			'markup' => auvyx_canvas_web_markup(),
			'ids'    => array( 'n1', 'n2', 'n3', 'n4', 'n5' ),
			'paths'  => array( 'content/0', 'content/0.0', 'content/0.1', 'content/0.1.0', 'content/1' ),
		);
		wp_set_current_user( 0 );
		auvyx_assert_same( 401, $call( $body )->get_status(), 'visitors' );
		wp_set_current_user( $author );
		auvyx_assert_same( 403, $call( $body )->get_status(), 'someone who cannot edit this page' );
		wp_set_current_user( $admin->ID );
		$bad        = $body;
		$bad['ids'] = array( 'n1' );
		auvyx_assert_same( 400, $call( $bad )->get_status() );
		$response = $call( $body );
		auvyx_assert_same( 200, $response->get_status() );
		auvyx_assert_same( 'no-store', $response->get_headers()['Cache-Control'] ?? '' );
		$data = $response->get_data();
		auvyx_assert_contains( 'data-auvyx-id="n3"', $data['html'] );
		auvyx_assert_same( 1, preg_match( '/class="wp-block-auvyx-section (auvyx-[a-z0-9]+)"/', $data['html'], $m ) );
		auvyx_assert_contains( '.' . $m[1] . '{', $data['css'], 'the rules of what it drew' );
		auvyx_assert_contains( 'gap:8px', $data['css'] );
		// the same markup on the page: the same HTML without the marks
		$page = apply_filters( 'the_content', auvyx_canvas_web_markup() ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound
		auvyx_assert_same( trim( $page ), trim( preg_replace( '/ data-auvyx-(id|path)="[^"]*"/', '', $data['html'] ) ) );
		auvyx_assert_same( auvyx_canvas_web_markup(), get_post( $post )->post_content, 'nothing saved' );
		wp_set_current_user( 0 );
	}
);

auvyx_test(
	'header builder: marker classes never reach visitor HTML, the saved block keeps them',
	static function () {
		$markup = '<!-- wp:auvyx/section {"className":"auvyx-sf-header-builder auvyx-sf-header-row-main mine"} -->' . "\n"
			. '<section class="wp-block-auvyx-section auvyx-sf-header-builder auvyx-sf-header-row-main mine"><!-- wp:auvyx/text {"className":"auvyx-sf-footer-item-text"} -->' . "\n"
			. '<p class="wp-block-auvyx-text auvyx-sf-footer-item-text">Hi</p>' . "\n" . '<!-- /wp:auvyx/text --></section>' . "\n" . '<!-- /wp:auvyx/section -->';
		$html   = do_blocks( $markup );
		auvyx_assert_not_contains( 'auvyx-sf-header-', $html );
		auvyx_assert_not_contains( 'auvyx-sf-footer-', $html );
		auvyx_assert_contains( 'class="wp-block-auvyx-section mine"', $html );
		auvyx_assert_contains( '<p class="wp-block-auvyx-text">Hi</p>', $html );
		$parsed = parse_blocks( $markup );
		auvyx_assert_same( 'auvyx-sf-header-builder auvyx-sf-header-row-main mine', $parsed[0]['attrs']['className'] );
		// a class that only looks like a marker stays
		auvyx_assert_contains( 'auvyx-sf-header-custom', do_blocks( '<!-- wp:auvyx/text {"className":"auvyx-sf-header-custom"} -->' . "\n" . '<p class="wp-block-auvyx-text auvyx-sf-header-custom">x</p>' . "\n" . '<!-- /wp:auvyx/text -->' ) );
	}
);

auvyx_test(
	'canvas web: a menu drawn on the canvas marks the canvas\'s page as current, as on that page',
	static function () {
		$admin = get_users( array( 'role' => 'administrator' ) )[0];
		wp_set_current_user( $admin->ID );
		$page    = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Current here',
				'post_name'   => 'current-here',
			)
		);
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/canvas/render' );
		$request->set_header( 'Content-Type', 'application/json' );
		$body = array(
			'post'   => $page,
			'markup' => '<!-- wp:auvyx/nav /-->',
			'ids'    => array( 'n1' ),
			'paths'  => array( 'content/0' ),
		);
		$request->set_body( wp_json_encode( $body ) );
		auvyx_assert_not_contains( 'aria-current', rest_do_request( $request )->get_data()['html'], 'without the page: none' );
		$body['at'] = (string) wp_parse_url( get_permalink( $page ), PHP_URL_PATH );
		$request->set_body( wp_json_encode( $body ) );
		auvyx_assert_contains( 'aria-current="page">Current here</a>', rest_do_request( $request )->get_data()['html'] );
		$body['at'] = '/<script>';
		$request->set_body( wp_json_encode( $body ) );
		auvyx_assert_same( 200, rest_do_request( $request )->get_status(), 'a path that is not one is ignored' );
		wp_set_current_user( 0 );
	}
);
