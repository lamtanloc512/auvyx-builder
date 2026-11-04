<?php
/**
 * Code elements' libraries (Modules/CodeElement): the shipped ones always; GSAP (`pro` in shared/code-libraries.json)
 * only when another plugin gives its address, never from Auvyx Builder itself.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\CodeElement\CodeElement;

auvyx_test(
	'code element: the shipped libraries only, until a plugin gives a pro library an https address',
	static function () {
		$saved = $GLOBALS['wp_filter']['auvyx_builder_code_library_urls'] ?? null;
		unset( $GLOBALS['wp_filter']['auvyx_builder_code_library_urls'] );
		try {
			auvyx_assert_same( array( 'motion', 'lenis', 'three', 'lottie', 'splitting' ), CodeElement::libraries() );
			auvyx_assert_same( array(), CodeElement::added() );
			add_filter(
				'auvyx_builder_code_library_urls',
				static function () {
					return array(
						'gsap'               => 'https://cdn.example/gsap.mjs',
						'motion'             => 'https://cdn.example/other-motion.mjs',
						'unlisted'           => 'https://cdn.example/x.mjs',
						'gsap-scrolltrigger' => 'http://cdn.example/st.mjs',
					);
				}
			);
			auvyx_assert_same( array( 'gsap' => array( 'https://cdn.example/gsap.mjs', 'gsap' ) ), CodeElement::added(), 'listed as pro, https only' );
			auvyx_assert_same( true, in_array( 'gsap', CodeElement::libraries(), true ) );
			auvyx_assert_same( false, in_array( 'unlisted', CodeElement::libraries(), true ) );
		} finally {
			unset( $GLOBALS['wp_filter']['auvyx_builder_code_library_urls'] );
			if ( null !== $saved ) {
				$GLOBALS['wp_filter']['auvyx_builder_code_library_urls'] = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
			}
		}
	}
);
