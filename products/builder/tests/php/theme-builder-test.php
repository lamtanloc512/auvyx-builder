<?php
/**
 * The Theme Builder (Modules/ThemeBuilder): headers and footers with Elementor-style display conditions; and the site's
 * components around a page's canvas.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Blocks\Markup;
use Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder;
use Auvyx\Builder\Plugin;

/** A published header or footer template with conditions (a plain component when $type is ""). */
function auvyx_test_part( string $text, string $type = 'header', array $conditions = array(), bool $synced = true ): int {
	$id = (int) wp_insert_post(
		array(
			'post_type'    => 'wp_block',
			'post_status'  => 'publish',
			'post_title'   => $text,
			'post_content' => wp_slash( Markup::text( $text ) ),
		)
	);
	if ( ! $synced ) {
		update_post_meta( $id, 'wp_pattern_sync_status', 'unsynced' );
	}
	if ( '' !== $type ) {
		update_post_meta( $id, ThemeBuilder::PART, $type );
		update_post_meta( $id, ThemeBuilder::CONDITIONS, $conditions );
	}
	$GLOBALS['auvyx_test_parts'][] = $id;
	return $id;
}

/** Pages a test made, deleted at its end (menus list the site's pages: other tests count them). */
function auvyx_test_part_page( array $args ): int {
	$id                         = (int) wp_insert_post(
		$args + array(
			'post_type'   => 'page',
			'post_status' => 'publish',
		)
	);
	$GLOBALS['auvyx_test_parts'][] = $id;
	return $id;
}

function auvyx_test_parts_cleanup(): void {
	foreach ( $GLOBALS['auvyx_test_parts'] ?? array() as $id ) {
		wp_delete_post( $id, true );
	}
	$GLOBALS['auvyx_test_parts'] = array();
	ThemeBuilder::flush();
	wp_reset_query();
}

/** Makes $id the page being viewed. */
function auvyx_test_part_view( int $id ): void {
	$GLOBALS['wp_query']     = new WP_Query( array( 'page_id' => $id ) );
	$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
}

auvyx_test(
	'a header with no conditions shows nowhere; Entire Site shows it in place of the theme’s',
	static function () {
		$tb     = Plugin::instance()->module( 'theme-builder' );
		$page   = auvyx_test_part_page( array( 'post_title' => 'TB page' ) );
		$header = array(
			'attrs' => array(
				'slug'    => 'header',
				'tagName' => 'header',
			),
		);
		$theme  = '<header class="wp-block-template-part">Theme header</header>';
		$id     = auvyx_test_part( 'Fresh header' );
		auvyx_test_part_view( $page );
		auvyx_assert_same( $theme, $tb->render_part( $theme, $header ), 'no conditions: not shown' );
		update_post_meta(
			$id,
			ThemeBuilder::CONDITIONS,
			array(
				array(
					'type' => 'include',
					'rule' => 'all',
				),
			)
		);
		$html = $tb->render_part( $theme, $header );
		auvyx_assert_contains( 'Fresh header', $html );
		auvyx_assert_contains( 'data-auvyx-component="' . $id . '"', $html );
		auvyx_assert_same( 'Comments', $tb->render_part( 'Comments', array( 'attrs' => array( 'slug' => 'comments' ) ) ), 'other parts stay' );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'Exclude leaves a page out; the more specific condition wins, the newest on a tie',
	static function () {
		$about = auvyx_test_part_page( array( 'post_title' => 'TB about' ) );
		$shop  = auvyx_test_part_page( array( 'post_title' => 'TB shop' ) );
		$site  = auvyx_test_part(
			'Site header',
			'header',
			array(
				array(
					'type' => 'include',
					'rule' => 'all',
				),
				array(
					'type' => 'exclude',
					'rule' => 'ids',
					'ids'  => array( $about ),
				),
			)
		);
		auvyx_test_part_view( $about );
		auvyx_assert_same( 0, ThemeBuilder::for_request( 'header' ), 'excluded: the theme’s' );
		auvyx_test_part_view( $shop );
		auvyx_assert_same( $site, ThemeBuilder::for_request( 'header' ) );
		$special = auvyx_test_part(
			'Shop header',
			'header',
			array(
				array(
					'type' => 'include',
					'rule' => 'ids',
					'ids'  => array( $shop ),
				),
			)
		);
		auvyx_assert_same( $special, ThemeBuilder::for_request( 'header' ), 'a page named beats Entire Site' );
		$newer = auvyx_test_part(
			'Newer site header',
			'header',
			array(
				array(
					'type' => 'include',
					'rule' => 'all',
				),
			)
		);
		auvyx_assert_same( $special, ThemeBuilder::for_request( 'header' ), 'still the more specific' );
		auvyx_test_part_view( $about );
		auvyx_assert_same( $newer, ThemeBuilder::for_request( 'header' ), 'the newer Entire Site has no exclusion' );
		auvyx_assert_same( array( $site => 'Site header' ), ThemeBuilder::conflicts( $newer ), 'both on Entire Site: a conflict to show' );
		auvyx_assert_same( 0, ThemeBuilder::for_request( 'footer' ), 'footers are their own' );
		wp_trash_post( $special );
		auvyx_test_part_view( $shop );
		auvyx_assert_same( $newer, ThemeBuilder::for_request( 'header' ), 'a trashed template shows nowhere' );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'conditions are stored clean and read in words',
	static function () {
		$about = auvyx_test_part_page( array( 'post_title' => 'TB words' ) );
		$clean = ThemeBuilder::sanitize_conditions(
			array(
				array(
					'type' => 'include',
					'rule' => 'all',
				),
				array(
					'type' => 'evil',
					'rule' => 'ids',
					'ids'  => array( (string) $about, 'x', -3 ),
				),
				'nope',
			)
		);
		auvyx_assert_same( 'include', $clean[1]['type'], 'an unknown type is an Include' );
		auvyx_assert_same( array( $about ), $clean[1]['ids'] );
		$clean[1]['type'] = 'exclude';
		auvyx_assert_same( 'Entire Site, except TB words', ThemeBuilder::describe( $clean ) );
		auvyx_assert_same( '', ThemeBuilder::describe( array() ), 'no conditions: no words (shown nowhere)' );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'Pro rules hold nowhere without Auvyx Builder Pro, never everywhere',
	static function () {
		$page = auvyx_test_part_page( array( 'post_title' => 'TB pro' ) );
		auvyx_test_part(
			'Archive header',
			'header',
			array(
				array(
					'type' => 'include',
					'rule' => 'archive',
				),
			)
		);
		auvyx_test_part_view( $page );
		auvyx_assert_same( 0, ThemeBuilder::for_request( 'header' ) );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'the Studio creates a template and saves its conditions, for who may change the theme only',
	static function () {
		$send = static function ( string $route, array $body ): WP_REST_Response {
			$request = new WP_REST_Request( 'POST', $route );
			$request->set_body_params( $body );
			return rest_get_server()->dispatch( $request );
		};
		wp_set_current_user(
			wp_insert_user(
				array(
					'user_login' => 'auvyx_tb_editor',
					'user_pass'  => 'x',
					'role'       => 'editor',
				)
			)
		);
		auvyx_assert_same(
			403,
			$send(
				'/auvyx/v1/theme-builder',
				array(
					'type'  => 'header',
					'title' => 'No',
				)
			)->get_status()
		);
		wp_set_current_user( 1 );
		$made = $send(
			'/auvyx/v1/theme-builder',
			array(
				'type'    => 'header',
				'title'   => 'From REST',
				'content' => Markup::text( 'Hello header' ),
			)
		);
		auvyx_assert_same( 201, $made->get_status() );
		$id                         = $made->get_data()['id'];
		$GLOBALS['auvyx_test_parts'][] = $id;
		auvyx_assert_same( 'header', ThemeBuilder::type_of( $id ) );
		auvyx_assert_same( '', ThemeBuilder::state( $id )['summary'], 'published with no conditions: shown nowhere' );
		$saved = $send(
			'/auvyx/v1/theme-builder/' . $id,
			array(
				'conditions' => array(
					array(
						'type' => 'include',
						'rule' => 'all',
					),
				),
			)
		);
		auvyx_assert_same( 'Entire Site', $saved->get_data()['summary'] );
		$plain = auvyx_test_part( 'Not a template', '' );
		auvyx_assert_same( 404, $send( '/auvyx/v1/theme-builder/' . $plain, array( 'conditions' => array() ) )->get_status(), 'a plain component is not a header' );
		$config = ThemeBuilder::studio_config( get_post( $id ) );
		auvyx_assert_same( 'header', $config['type'] );
		auvyx_assert_same( false, in_array( 'archive', array_column( $config['rules'], 'value' ), true ), 'without Pro, no archives rule' );
		$pro    = static fn() => array( 'archive' => 'Archives' );
		add_filter( 'auvyx_builder_theme_rules', $pro );
		$config = ThemeBuilder::studio_config( get_post( $id ) );
		remove_filter( 'auvyx_builder_theme_rules', $pro );
		auvyx_assert_same( true, in_array( 'archive', array_column( array_filter( $config['rules'], static fn( $r ) => $r['pro'] ), 'value' ), true ), 'archives come with Pro, marked Pro' );
		auvyx_assert_same( null, ThemeBuilder::studio_config( get_post( $plain ) ) );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'a preview shows a template to people who edit, and never to visitors',
	static function () {
		$a    = auvyx_test_part( 'Preview header' );
		$page = auvyx_test_part_page( array( 'post_title' => 'TB preview' ) );
		auvyx_test_part_view( $page );
		$_GET[ ThemeBuilder::PREVIEW . 'header' ] = (string) $a;
		wp_set_current_user( 1 );
		auvyx_assert_same( $a, ThemeBuilder::for_request( 'header' ), 'shown though it has no conditions' );
		wp_set_current_user( 0 );
		auvyx_assert_same( 0, ThemeBuilder::for_request( 'header' ), 'a visitor sees the site' );
		wp_set_current_user( 1 );
		unset( $_GET[ ThemeBuilder::PREVIEW . 'header' ] );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'a page’s canvas shows the components placed around its content; a component’s canvas does not',
	static function () {
		$components = Plugin::instance()->module( 'components' );
		$id         = auvyx_test_component(
			Markup::text( 'Around the root' ),
			array(
				array(
					'location' => 'before_content',
					'rule'     => 'all',
				),
			)
		);
		$components->flush();
		$page = auvyx_test_part_page( array( 'post_title' => 'Canvas page' ) );
		auvyx_test_part_view( $page );
		$_GET['auvyx-canvas'] = 'x';
		$components->attach_locations();
		$root = (string) apply_filters( 'auvyx_builder_canvas_root', '<!--auvyx-canvas-root-->' );
		auvyx_assert_contains( 'Around the root', $root );
		auvyx_assert_contains( 'data-auvyx-components="' . $id . '"', $root, 'the canvas can offer "Edit" on it' );
		auvyx_assert_same( true, strpos( $root, 'Around the root' ) < strpos( $root, '<!--auvyx-canvas-root-->' ), 'before the content' );
		remove_all_filters( 'auvyx_builder_canvas_root' );
		$_GET['auvyx-bare'] = '1';
		$components->attach_locations();
		auvyx_assert_same( '<!--auvyx-canvas-root-->', (string) apply_filters( 'auvyx_builder_canvas_root', '<!--auvyx-canvas-root-->' ), 'nothing around a component' );
		unset( $_GET['auvyx-canvas'], $_GET['auvyx-bare'] );
		update_post_meta( $id, '_auvyx_locations', array() );
		$components->flush();
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'a component says where it shows, in words, and which pages insert it',
	static function () {
		$components = Plugin::instance()->module( 'components' );
		$id         = auvyx_test_component( Markup::text( 'Counted' ) );
		$about      = auvyx_test_part_page(
			array(
				'post_title'   => 'About us',
				'post_content' => '<!-- wp:block {"ref":' . $id . '} /-->',
			)
		);
		auvyx_test_part_page(
			array(
				'post_status'  => 'draft',
				'post_title'   => 'Draft',
				'post_content' => '[auvyx_component id="' . $id . '"]',
			)
		);
		auvyx_test_part_page(
			array(
				'post_title'   => 'Other',
				'post_content' => '<!-- wp:block {"ref":' . $id . '0} /-->',
			)
		);
		auvyx_assert_same( 2, count( $components::inserted_in( $id ) ), 'a block and a shortcode; not the component ' . $id . '0' );
		update_post_meta(
			$id,
			'_auvyx_locations',
			array(
				array(
					'location' => 'before_footer',
					'rule'     => 'ids',
					'ids'      => array( $about ),
				),
			)
		);
		auvyx_assert_same( array( 'above the footer, on the pages I pick (About us)', 'inserted in 2 pages' ), $components->uses( $id ) );
		$part = auvyx_test_part(
			'Footer in words',
			'footer',
			array(
				array(
					'type' => 'include',
					'rule' => 'all',
				),
			)
		);
		auvyx_assert_same( array( 'as the footer on Entire Site' ), $components->uses( $part ) );
		$note = \Auvyx\Builder\Modules\Studio\Studio::page_note( get_post( $part ) );
		auvyx_assert_contains( 'This footer shows on: Entire Site', $note['text'] );
		update_post_meta( $id, '_auvyx_locations', array() );
		auvyx_test_parts_cleanup();
	}
);

auvyx_test(
	'pages are picked by title, ticked ones first',
	static function () {
		$a    = auvyx_test_part_page( array( 'post_title' => 'Zebra page' ) );
		$html = \Auvyx\Builder\Modules\Studio\Admin::page_picker( 'auvyx_locations[0][ids]', array( $a ) );
		auvyx_assert_contains( 'name="auvyx_locations[0][ids][]" value="' . $a . '" checked', $html );
		auvyx_assert_same( true, strpos( $html, 'Zebra page' ) < strpos( $html, 'Sample Page' ), 'the ticked page first' );
		auvyx_test_parts_cleanup();
	}
);
