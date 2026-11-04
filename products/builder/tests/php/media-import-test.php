<?php
/**
 * Pictures copied from another site (Modules/MediaImport): who may, which addresses, which files, and once per URL.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\MediaImport\MediaImport;

/** A 1×1 PNG, served for every remote address while $serve runs. */
function auvyx_test_media_serve( callable $serve ): void {
	$png    = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
	$filter = static function ( $answer, $args, $url ) use ( $png ) {
		$body = false !== strpos( $url, 'not-a-picture' ) ? '<html>nope</html>' : $png;
		if ( ! empty( $args['filename'] ) ) {
			file_put_contents( $args['filename'], $body ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		return array(
			'headers'  => array( 'content-type' => 'image/png' ),
			'body'     => $body,
			'response' => array(
				'code'    => 200,
				'message' => 'OK',
			),
			'cookies'  => array(),
			'filename' => $args['filename'] ?? null,
		);
	};
	add_filter( 'pre_http_request', $filter, 10, 3 );
	try {
		$serve();
	} finally {
		remove_filter( 'pre_http_request', $filter, 10 );
	}
}

function auvyx_test_media_request( string $url, string $alt = '' ): WP_REST_Response {
	$request = new WP_REST_Request( 'POST', '/auvyx/v1/media/sideload' );
	$request->set_param( 'url', $url );
	$request->set_param( 'alt', $alt );
	return rest_do_request( $request );
}

auvyx_test(
	'media import: copies a picture once, with its alt text; the second import of the same address reuses it',
	static function () {
		wp_set_current_user( 1 );
		auvyx_test_media_serve(
			static function () {
				$first = auvyx_test_media_request( 'https://old-site.example/wp-content/uploads/2024/05/latte.png', 'A latte' );
				auvyx_assert_same( 200, $first->get_status() );
				$id = (int) $first->get_data()['id'];
				auvyx_assert_same( true, $id > 0, 'an attachment' );
				auvyx_assert_same( 'A latte', get_post_meta( $id, '_wp_attachment_image_alt', true ) );
				auvyx_assert_same( 'https://old-site.example/wp-content/uploads/2024/05/latte.png', get_post_meta( $id, MediaImport::SOURCE, true ) );
				auvyx_assert_contains( 'latte', (string) $first->get_data()['url'], 'served from this site' );
				$again = auvyx_test_media_request( 'https://old-site.example/wp-content/uploads/2024/05/latte.png' );
				auvyx_assert_same( $id, (int) $again->get_data()['id'] );
				// a CDN address with no extension takes the one its bytes say
				$cdn = auvyx_test_media_request( 'https://cdn.example/i/8f2a' );
				auvyx_assert_same( 200, $cdn->get_status() );
				auvyx_assert_same( '.png', substr( (string) $cdn->get_data()['url'], -4 ) );
				wp_delete_attachment( $id, true );
				wp_delete_attachment( (int) $cdn->get_data()['id'], true );
			}
		);
	}
);

auvyx_test(
	'media import: refuses visitors and subscribers, other schemes, local addresses, scripts and files that are not pictures',
	static function () {
		wp_set_current_user( 0 );
		auvyx_assert_same( 401, auvyx_test_media_request( 'https://old-site.example/a.png' )->get_status() );
		$subscriber = wp_insert_user(
			array(
				'user_login' => 'auvyx_media_sub',
				'user_pass'  => wp_generate_password(),
				'role'       => 'subscriber',
			)
		);
		wp_set_current_user( $subscriber );
		auvyx_assert_same( 403, auvyx_test_media_request( 'https://old-site.example/a.png' )->get_status() );
		wp_set_current_user( 1 );
		auvyx_test_media_serve(
			static function () {
				auvyx_assert_same( 400, auvyx_test_media_request( 'file:///etc/passwd' )->get_status() );
				auvyx_assert_same( 400, auvyx_test_media_request( 'http://127.0.0.1/wp-content/uploads/a.png' )->get_status() );
				auvyx_assert_same( 400, auvyx_test_media_request( 'https://old-site.example/evil.svg' )->get_status() );
				auvyx_assert_same( 400, auvyx_test_media_request( 'https://old-site.example/shell.php' )->get_status() );
				auvyx_assert_same( 400, auvyx_test_media_request( 'https://old-site.example/not-a-picture.jpg' )->get_status() );
			}
		);
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $subscriber );
	}
);
