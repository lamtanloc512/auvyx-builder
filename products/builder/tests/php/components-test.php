<?php
/**
 * Components (synced patterns) + visual builder canvas.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Blocks\Markup;
use Auvyx\Builder\Plugin;

/** Creates a published component and returns its id. */
function auvyx_test_component( string $content, array $locations = array() ): int {
	$id = wp_insert_post(
		array(
			'post_type'    => 'wp_block',
			'post_status'  => 'publish',
			'post_title'   => 'Test component',
			'post_content' => wp_slash( $content ),
		)
	);
	if ( $locations ) {
		update_post_meta( $id, '_auvyx_locations', $locations );
	}
	return (int) $id;
}

auvyx_test(
	'locations meta is registered for REST with a schema',
	static function () {
		$keys = get_registered_meta_keys( 'post', 'wp_block' );
		auvyx_assert_same( true, isset( $keys['_auvyx_locations'] ), 'registered' );
		auvyx_assert_same( 'array', $keys['_auvyx_locations']['type'] );
		auvyx_assert_same( true, is_array( $keys['_auvyx_locations']['show_in_rest'] ) );
	}
);

auvyx_test(
	'sanitize_locations drops unknown locations and bad values',
	static function () {
		$components = Plugin::instance()->module( 'components' );
		auvyx_assert_same(
			array(
				array(
					'location'  => 'after_content',
					'rule'      => 'all',
					'postTypes' => array( 'page' ),
					'ids'       => array( 4 ),
					'terms'     => array(),
					'exclude'   => array(),
					'audience'  => 'all',
					'roles'     => array(),
					'from'      => '',
					'until'     => '',
				),
			),
			$components->sanitize_locations(
				array(
					array( 'location' => 'after_content', 'rule' => 'evil', 'postTypes' => array( 'Page!' ), 'ids' => array( '4', 'x', -1 ) ),
					array( 'location' => 'wp_head' ),
					'nope',
				)
			)
		);
	}
);

auvyx_test(
	'instances, shortcode and nested references render with Auvyx styles',
	static function () {
		$id   = auvyx_test_component( Markup::text( 'From component', Markup::styles( array( 'color' => 'tomato' ) ) ) );
		$html = do_blocks( '<!-- wp:block {"ref":' . $id . '} /-->' );
		auvyx_assert_contains( 'From component', $html, 'core reference renders' );
		auvyx_assert_contains( 'class="wp-block-auvyx-text auvyx-', $html, 'styles applied inside instances' );
		auvyx_assert_contains( 'From component', do_shortcode( '[auvyx_component id="' . $id . '"]' ), 'shortcode' );
		auvyx_assert_same( '', do_shortcode( '[auvyx_component id="999999"]' ), 'missing id renders nothing' );
	}
);

auvyx_test(
	'a component that includes itself does not recurse forever',
	static function () {
		$id = auvyx_test_component( 'placeholder' );
		wp_update_post(
			array(
				'ID'           => $id,
				'post_content' => '<!-- wp:shortcode -->[auvyx_component id="' . $id . '"]<!-- /wp:shortcode -->',
			)
		);
		$html = Plugin::instance()->module( 'components' )->render( $id );
		auvyx_assert_same( true, strlen( $html ) < 500, 'bounded output' );
	}
);

auvyx_test(
	'placed components are cached and matched by rule',
	static function () {
		$components = Plugin::instance()->module( 'components' );
		$id         = auvyx_test_component( Markup::text( 'Placed' ), array( array( 'location' => 'before_footer', 'rule' => 'ids', 'postTypes' => array(), 'ids' => array( 123 ) ) ) );
		$components->flush();
		$placed = $components->placed();
		auvyx_assert_same( true, isset( $placed[ $id ] ), 'listed' );
		auvyx_assert_same( false, $components->matches( $placed[ $id ][0] ), 'not on this request (no singular 123)' );
		auvyx_assert_same( true, $components->matches( array( 'rule' => 'all' ) ) );
	}
);

auvyx_test(
	'canvas replaces only the queried post content with the root marker',
	static function () {
		$builder = Plugin::instance()->module( 'visual-builder' );
		$page    = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Canvas host', 'post_content' => 'Original' ) );
		$GLOBALS['wp_query'] = new WP_Query( array( 'page_id' => $page ) );
		$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
		$GLOBALS['post'] = get_post( $page );
		setup_postdata( $GLOBALS['post'] );

		$reflection = new ReflectionProperty( $builder, 'canvas' );
		$reflection->setAccessible( true );
		$reflection->setValue( $builder, true );

		// A bound excerpt rendered before the content runs the_content inside get_the_excerpt: it must not take the marker.
		$seen   = '';
		$probe  = static function ( $excerpt ) use ( $builder, &$seen ) {
			$seen = $builder->canvas_content( 'From excerpt' );
			return $excerpt;
		};
		add_filter( 'get_the_excerpt', $probe );
		get_the_excerpt( $page );
		remove_filter( 'get_the_excerpt', $probe );
		auvyx_assert_same( 'From excerpt', $seen, 'excerpt keeps its content' );

		auvyx_assert_same( '<!--auvyx-canvas-root-->', $builder->canvas_content( 'Original' ) );
		auvyx_assert_same( 'Second call', $builder->canvas_content( 'Second call' ), 'only once per request' );
		wp_reset_postdata();
	}
);

auvyx_test(
	'Auvyx Editor is the only editor: old Studio links redirect to it, a saved "studio" choice is ignored',
	static function () {
		wp_set_current_user( 1 );
		update_option( \Auvyx\Builder\Modules\Studio\Studio::SETTINGS, array( 'post_types' => array( 'page', 'post' ), 'editor' => 'studio' ) );
		$page = get_post( wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'x' ) ) );
		auvyx_assert_same( false, \Auvyx\Builder\Modules\Studio\Studio::available(), 'the Studio never opens' );
		auvyx_assert_same( 'editor', \Auvyx\Builder\Modules\Studio\Studio::settings()['editor'] );
		auvyx_assert_same( \Auvyx\Builder\Modules\Editor\Editor::url( $page->ID ), \Auvyx\Builder\Modules\Studio\Studio::url( $page->ID ) );
		auvyx_assert_contains( 'action=auvyx-editor', \Auvyx\Builder\Modules\Studio\Studio::url( $page->ID ) );
		// post.php?post=ID&action=auvyx-studio&view=sites → the same document and arguments in Auvyx Editor.
		$to = \Auvyx\Builder\Modules\Studio\Studio::redirect_url(
			$page->ID,
			array(
				'post'             => (string) $page->ID,
				'action'           => 'auvyx-studio',
				'view'             => 'sites',
				'auvyx-conditions' => '1',
			)
		);
		auvyx_assert_contains( 'post=' . $page->ID . '&action=auvyx-editor', $to );
		auvyx_assert_contains( 'view=sites', $to );
		auvyx_assert_contains( 'auvyx-conditions=1', $to );
		auvyx_assert_same( false, strpos( $to, 'auvyx-studio' ), 'the old action is not carried along' );
		auvyx_assert_same( false, has_filter( 'page_row_actions', array( Plugin::instance()->module( 'studio' ), 'row_action' ) ), 'no "Edit in Auvyx Studio" row action' );
		auvyx_assert_same( true, (bool) has_action( 'post_action_auvyx-studio' ), 'the old address is still answered (with a redirect)' );
		if ( \Auvyx\Builder\Modules\Editor\Editor::available() ) {
			$actions = Plugin::instance()->module( 'editor' )->row_action( array(), $page );
			auvyx_assert_contains( 'action=auvyx-editor', $actions['auvyx-editor'] ?? '' );
		}
		delete_option( \Auvyx\Builder\Modules\Studio\Studio::SETTINGS );
	}
);
