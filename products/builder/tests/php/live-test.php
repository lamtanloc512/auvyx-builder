<?php
/**
 * Studio Live (docs/studio-live-sandbox.md): the kept document, its policy, and which files the CORS asset route serves.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Live\Live;

function auvyx_live_rest( array $body ): WP_REST_Response {
	$request = new WP_REST_Request( 'POST', '/auvyx/v1/live' );
	$request->set_header( 'Content-Type', 'application/json' );
	$request->set_body( (string) wp_json_encode( $body ) );
	return rest_ensure_response( rest_do_request( $request ) );
}

function auvyx_live_user( string $role ): int {
	return wp_insert_user(
		array(
			'user_login' => 'live_' . $role . '_' . wp_rand(),
			'user_pass'  => wp_generate_password(),
			'role'       => $role,
		)
	);
}

auvyx_test(
	'live: an editor keeps the open document under a random token; the answer is the post with that token',
	static function () {
		wp_set_current_user( auvyx_live_user( 'editor' ) );
		$post   = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Live test' ) );
		$markup = '<!-- wp:paragraph --><p>Unsaved words</p><!-- /wp:paragraph -->';
		$answer = auvyx_live_rest(
			array(
				'post'   => $post,
				'markup' => $markup,
				'ids'    => array( 'n1' ),
				'paths'  => array( 'content/0' ),
			)
		);
		auvyx_assert_same( 200, $answer->get_status() );
		auvyx_assert_same( 'no-store', $answer->get_headers()['Cache-Control'] ?? '' );
		$url = (string) $answer->get_data()['url'];
		auvyx_assert_same( 1, preg_match( '/[?&]auvyx_live=([a-f0-9]{32})$/', $url, $m ), $url );
		$kept = get_transient( Live::KEPT . $m[1] );
		auvyx_assert_same( $post, $kept['post'] );
		auvyx_assert_contains( 'Unsaved words', $kept['markup'] );
		auvyx_assert_contains( '"auvyxCanvas":{"id":"n1"', $kept['markup'], 'marked like the canvas, so errors map to elements' );
	}
);

auvyx_test(
	'live: who may not edit the post keeps nothing; marks that do not fit are refused',
	static function () {
		wp_set_current_user( auvyx_live_user( 'editor' ) );
		$post = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Live test 2' ) );
		$bad  = auvyx_live_rest(
			array(
				'post'   => $post,
				'markup' => '<p>x</p>',
				'ids'    => array( 'n1', 'n2' ),
				'paths'  => array( 'content/0' ),
			)
		);
		auvyx_assert_same( 400, $bad->get_status() );
		wp_set_current_user( auvyx_live_user( 'subscriber' ) );
		$denied = auvyx_live_rest(
			array(
				'post'   => $post,
				'markup' => '<p>x</p>',
				'ids'    => array(),
				'paths'  => array(),
			)
		);
		auvyx_assert_same( 403, $denied->get_status() );
	}
);

auvyx_test(
	'live: the policy sandboxes the document, lets it reach only the public data route, and only this site may frame it',
	static function () {
		$csp = Live::csp();
		auvyx_assert_same( 0, strpos( $csp, 'sandbox allow-scripts;' ), $csp );
		auvyx_assert_not_contains( 'allow-same-origin', $csp );
		auvyx_assert_contains( 'connect-src ' . strtok( rest_url( 'auvyx/v1/data/' ), '?' ), $csp );
		auvyx_assert_contains( "form-action 'none'", $csp );
		auvyx_assert_contains( 'frame-ancestors ' . untrailingslashit( home_url() ), $csp );
	}
);

auvyx_test(
	'live: the asset route serves fonts under wp-content and this plugin\'s scripts, nothing else',
	static function () {
		$plugin = trim( substr( wp_normalize_path( (string) realpath( AUVYX_BUILDER_DIR ) ), strlen( wp_normalize_path( (string) realpath( WP_CONTENT_DIR ) ) ) ), '/' );
		auvyx_assert_same( true, null !== Live::asset_file( $plugin . '/assets/lib/three.js' ), 'a code library' );
		auvyx_assert_same( null, Live::asset_file( $plugin . '/auvyx-builder.php' ), 'PHP is never served' );
		auvyx_assert_same( null, Live::asset_file( $plugin . '/../../../wp-config.php' ), 'nothing outside wp-content' );
		auvyx_assert_same( null, Live::asset_file( $plugin . '/assets/lib/../../../../themes/x.js' ), 'scripts only from the plugin' );
		auvyx_assert_same( null, Live::asset_file( 'uploads/missing.woff2' ), 'only files that exist' );
		$font = WP_CONTENT_DIR . '/uploads/auvyx-live-test.woff2';
		file_put_contents( $font, 'wOF2' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		auvyx_assert_same( realpath( $font ), Live::asset_file( 'uploads/auvyx-live-test.woff2' ), 'a font' );
		unlink( $font ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	}
);
