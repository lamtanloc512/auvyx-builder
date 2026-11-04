<?php
/**
 * Sandboxed custom code: the public render is an iframe the page cannot be reached from,
 * and a user without unfiltered_html cannot save the source.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Sandbox\SandboxFrame;

auvyx_test(
	'custom code renders as a sandboxed iframe and cannot break out of it',
	static function () {
		$payload = '</section><script>alert(1)</script><iframe src="javascript:alert(2)"></iframe>';
		$attrs   = wp_json_encode(
			array(
				'className' => 'auvyx-sandbox',
				'auvyx'        => array(
					'v'       => 1,
					'label'   => 'Widget',
					'sandbox' => array(
						'html'  => $payload,
						'css'   => 'b{color:var(--wp--preset--color--auvyx-primary)}',
						'js'    => "parent.document.title='pwned'",
						'allow' => array( 'http://evil.test', 'https://cdn.example.com/secret', 'https://cdn.example.com' ),
					),
				),
			)
		);
		$content = "<!-- wp:auvyx/section {$attrs} -->\n<div class=\"wp-block-auvyx-section auvyx-sandbox\"></div>\n<!-- /wp:auvyx/section -->";
		$html    = do_blocks( $content );
		auvyx_assert_contains( 'sandbox="allow-scripts"', $html );
		auvyx_assert_not_contains( 'allow-same-origin', $html );
		auvyx_assert_not_contains( 'allow-top-navigation', $html );
		auvyx_assert_not_contains( 'allow-popups', $html );
		auvyx_assert_not_contains( '<script', $html );
		auvyx_assert_not_contains( 'src="javascript:', $html );
		auvyx_assert_contains( 'https://cdn.example.com', $html );
		auvyx_assert_not_contains( 'http://evil.test', $html );
		auvyx_assert_not_contains( 'cdn.example.com/secret', $html );
		auvyx_assert_same( 1, substr_count( $html, '<iframe' ) );
		$frame = SandboxFrame::iframe(
			array(
				'html'  => '<p id="inside">in</p>',
				'css'   => '',
				'js'    => 'try{parent.document.body.dataset.mark="pwned"}catch(e){parent.postMessage({reach:"blocked"},"*")}',
				'allow' => array(),
			)
		);
		auvyx_assert_contains( 'connect-src', $frame );
		auvyx_assert_contains( 'none', $frame );
		auvyx_assert_not_contains( '<p id="inside">', $frame );
	}
);

auvyx_test(
	'only a user who may add scripts keeps custom code on save',
	static function () {
		$content = '<!-- wp:auvyx/section {"className":"auvyx-sandbox","auvyx":{"v":1,"label":"Widget","sandbox":{"html":"hello","css":"","js":"","allow":""}}} -->' . "\n"
			. '<div class="wp-block-auvyx-section auvyx-sandbox"></div>' . "\n"
			. '<!-- /wp:auvyx/section -->';
		$author  = wp_insert_user(
			array(
				'user_login' => 'sandbox-author-' . wp_generate_password( 6, false ),
				'user_pass'  => wp_generate_password(),
				'role'       => 'author',
			)
		);
		auvyx_assert_same( true, is_int( $author ), 'author created' );
		wp_set_current_user( $author );
		$id    = wp_insert_post( array( 'post_title' => 'Sandbox guard', 'post_content' => wp_slash( $content ), 'post_status' => 'draft' ) );
		$saved = get_post( $id )->post_content;
		auvyx_assert_not_contains( '"sandbox"', $saved, 'an author loses custom code' );
		auvyx_assert_contains( '"label":"Widget"', $saved, 'the rest of the attribute stays' );
		wp_set_current_user( 1 );
		if ( current_user_can( 'unfiltered_html' ) ) {
			$admin = get_post( wp_insert_post( array( 'post_title' => 'Sandbox kept', 'post_content' => wp_slash( $content ), 'post_status' => 'draft' ) ) )->post_content;
			auvyx_assert_contains( '"sandbox"', $admin, 'an administrator keeps it' );
		}
	}
);
