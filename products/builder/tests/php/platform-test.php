<?php
/**
 * Platform: responsive images, roles without unfiltered_html, uninstall.
 *
 * @package Auvyx\Builder
 */

/** Creates an image attachment with generated sizes metadata (no real file needed for srcset). */
function auvyx_test_attachment(): int {
	$upload = wp_upload_dir();
	$id     = wp_insert_attachment(
		array(
			'post_mime_type' => 'image/jpeg',
			'post_title'     => 'Photo',
			'post_status'    => 'inherit',
		),
		$upload['basedir'] . '/2026/10/photo.jpg'
	);
	wp_update_attachment_metadata(
		$id,
		array(
			'width'  => 2000,
			'height' => 1000,
			'file'   => '2026/10/photo.jpg',
			'sizes'  => array(
				'medium'       => array( 'file' => 'photo-300x150.jpg', 'width' => 300, 'height' => 150, 'mime-type' => 'image/jpeg' ),
				'medium_large' => array( 'file' => 'photo-768x384.jpg', 'width' => 768, 'height' => 384, 'mime-type' => 'image/jpeg' ),
				'large'        => array( 'file' => 'photo-1024x512.jpg', 'width' => 1024, 'height' => 512, 'mime-type' => 'image/jpeg' ),
			),
		)
	);
	return (int) $id;
}

auvyx_test(
	'responsive images: Media Library images get srcset, sizes, width and height (loading is left to core heuristics)',
	static function () {
		$id     = auvyx_test_attachment();
		$url    = wp_get_attachment_url( $id );
		$markup = '<!-- wp:auvyx/image {"id":' . $id . '} --><img class="wp-block-auvyx-image" src="' . esc_url( $url ) . '" alt="A"/><!-- /wp:auvyx/image -->';
		$html   = do_blocks( $markup ); // outside the_content: the block filter applies core's content tag filters itself.
		auvyx_assert_contains( 'wp-image-' . $id, $html );
		auvyx_assert_contains( 'srcset="', $html );
		auvyx_assert_contains( 'sizes="', $html );
		auvyx_assert_contains( 'width="2000"', $html );
		auvyx_assert_contains( 'height="1000"', $html );

		$external = do_blocks( '<!-- wp:auvyx/image --><img class="wp-block-auvyx-image" src="https://example.com/x.jpg" alt=""/><!-- /wp:auvyx/image -->' );
		auvyx_assert_not_contains( 'srcset', $external, 'external images are left alone' );
	}
);

/**
 * Saves markup through the REST API as a given role, like the Studio does.
 *
 * @return string Saved post_content.
 */
function auvyx_test_save_as( string $role, string $content ): string {
	$user = wp_insert_user( array( 'user_login' => 'auvyx_' . $role . wp_rand(), 'user_pass' => 'x', 'role' => $role ) );
	wp_set_current_user( $user );
	$request = new WP_REST_Request( 'POST', '/wp/v2/posts' );
	$request->set_body_params(
		array(
			'title'   => 'Role test',
			'content' => $content,
			'status'  => 'draft',
		)
	);
	$response = rest_do_request( $request );
	auvyx_assert_same( 201, $response->get_status(), $role . ': ' . wp_json_encode( $response->get_data() ) );
	return get_post( $response->get_data()['id'] )->post_content;
}

auvyx_test(
	'roles without unfiltered_html (author, contributor) keep Auvyx markup intact through kses',
	static function () {
		$markup = (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/studio.html' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		foreach ( array( 'author', 'contributor' ) as $role ) {
			$saved = auvyx_test_save_as( $role, $markup );
			auvyx_assert_same( false, user_can( wp_get_current_user(), 'unfiltered_html' ), $role . ' has no unfiltered_html' );
			// kses only rewrites void tags "<img …/>" → "<img … />" (equivalent HTML); nothing else may change.
			$void = static function ( string $html ): string {
				return (string) preg_replace( '#\s*/>#', '/>', $html );
			};
			auvyx_assert_same(
				wp_json_encode( parse_blocks( $void( $markup ) ) ),
				wp_json_encode( parse_blocks( $void( $saved ) ) ),
				$role . ': kses changed the blocks'
			);
		}
	}
);

auvyx_test(
	'uninstall removes settings and caches, never content' . ( is_multisite() ? ', on every site of the network' : '' ),
	static function () {
		$sub_site = 0;
		if ( is_multisite() ) {
			$sub_site = wp_insert_site( array( 'domain' => 'localhost', 'path' => '/sub/' ) );
			auvyx_assert_same( true, is_int( $sub_site ), 'sub-site created' );
			switch_to_blog( $sub_site );
			update_option( 'auvyx_design_system', array( 'version' => 1 ) );
			restore_current_blog();
		}
		update_option( 'auvyx_design_system', array( 'version' => 1 ) );
		update_option( 'auvyx_builder_settings', array( 'post_types' => array( 'page' ) ) );
		update_option( 'auvyx_builder_ai', array( 'key' => 'x' ) );
		set_transient( 'auvyx_component_locations', array( 1 ) );
		$component = wp_insert_post( array( 'post_type' => 'wp_block', 'post_status' => 'publish', 'post_title' => 'Keep me' ) );
		update_post_meta( $component, '_auvyx_locations', array( array( 'location' => 'before_footer' ) ) );

		if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
			define( 'WP_UNINSTALL_PLUGIN', 'auvyx-builder/auvyx-builder.php' );
		}
		include AUVYX_BUILDER_DIR . 'uninstall.php';

		auvyx_assert_same( false, get_option( 'auvyx_design_system' ) );
		auvyx_assert_same( false, get_option( 'auvyx_builder_settings' ) );
		auvyx_assert_same( false, get_option( 'auvyx_builder_ai' ), 'AI settings (encrypted key) removed' );
		auvyx_assert_same( false, get_transient( 'auvyx_component_locations' ) );
		auvyx_assert_same( false, metadata_exists( 'post', $component, '_auvyx_locations' ) );
		auvyx_assert_same( 'Keep me', get_post( $component )->post_title, 'content is kept' );
		if ( $sub_site ) {
			switch_to_blog( $sub_site );
			$left = get_option( 'auvyx_design_system' );
			restore_current_blog();
			auvyx_assert_same( false, $left, 'sub-site settings removed' );
		}
	}
);
