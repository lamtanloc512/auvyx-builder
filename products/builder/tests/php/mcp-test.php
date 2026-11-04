<?php
/**
 * The MCP server's routes (Modules/Mcp) and the blank page template (Modules/BlankPage).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\BlankPage\BlankPage;
use Auvyx\Builder\Modules\Mcp\Mcp;

/** A REST answer as the given user. */
function auvyx_mcp_request( string $method, string $route, array $params = array(), int $user = 1 ): WP_REST_Response {
	$was = get_current_user_id();
	wp_set_current_user( $user );
	$request = new WP_REST_Request( $method, $route );
	foreach ( $params as $k => $v ) {
		$request->set_param( $k, $v );
	}
	$response = rest_do_request( $request );
	wp_set_current_user( $was );
	return $response;
}

auvyx_test(
	'mcp: the blank template is only the content, full width, flush',
	static function () {
		$content = BlankPage::content();
		auvyx_assert_contains( '<!-- wp:post-content', $content );
		auvyx_assert_contains( '"className":"auvyx-blank"', $content );
		auvyx_assert_contains( '"align":"full"', $content );
		auvyx_assert_not_contains( 'template-part', $content, 'no header or footer' );
		if ( function_exists( 'register_block_template' ) && wp_is_block_theme() ) {
			$template = get_block_template( 'auvyx-builder//' . BlankPage::SLUG );
			auvyx_assert_same( true, null !== $template, 'registered for block themes' );
		}
	}
);

auvyx_test(
	'mcp: the site answer lists templates, parts, blocks and libraries; only for editors',
	static function () {
		$r = auvyx_mcp_request( 'GET', '/auvyx/v1/mcp/site' );
		auvyx_assert_same( 200, $r->get_status() );
		$d = $r->get_data();
		auvyx_assert_same( '', $d['templates'][0]['slug'], 'the theme default first' );
		auvyx_assert_same( true, is_bool( $d['canScript'] ) );
		auvyx_assert_same( true, count( $d['blocks'] ) > 0 );
		auvyx_assert_same( true, in_array( 'three', array_column( $d['libraries'], 'name' ), true ) );
		if ( '' !== $d['blankTemplate'] ) {
			auvyx_assert_same( true, in_array( BlankPage::SLUG, array_column( $d['templates'], 'slug' ), true ), 'the blank template is offered' );
		}
		auvyx_assert_same( true, is_array( $d['extensions'] ) );
		auvyx_assert_same( true, in_array( 'publish', $d['scopes'], true ), 'without a token: what the user may do' );
		auvyx_assert_same( 401, auvyx_mcp_request( 'GET', '/auvyx/v1/mcp/site', array(), 0 )->get_status() );
	}
);

auvyx_test(
	'mcp: pages are created as drafts through auvyx/v1/mcp/pages and saved through auvyx/v1/mcp/save; editors only',
	static function () {
		auvyx_assert_same( 401, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/pages', array( 'title' => 'X' ), 0 )->get_status() );
		$r = auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/pages', array( 'title' => 'Made', 'template' => 'no-such-template' ) );
		auvyx_assert_same( 400, $r->get_status(), 'an unknown template' );
		$r = auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/pages', array( 'title' => 'Made', 'slug' => 'made-by-mcp' ) );
		auvyx_assert_same( 201, $r->get_status() );
		$d = $r->get_data();
		auvyx_assert_same( 'draft', get_post_status( $d['id'] ) );
		$r = auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/save/' . $d['id'], array( 'content' => '<!-- wp:auvyx/text --><p class="wp-block-auvyx-text">Hi</p><!-- /wp:auvyx/text -->', 'version' => $d['version'], 'status' => 'publish' ) );
		auvyx_assert_same( 'live', $r->get_data()['where'], 'an administrator without a token may publish' );
		auvyx_assert_same( 'publish', get_post_status( $d['id'] ) );
		auvyx_assert_same( 401, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/save/' . $d['id'], array( 'content' => '', 'version' => '' ), 0 )->get_status() );
		auvyx_assert_same( 400, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/save/' . $d['id'], array( 'content' => '' ) )->get_status(), 'a save needs the version' );
		wp_delete_post( $d['id'], true );
	}
);

auvyx_test(
	'mcp: a document is the Studio tree of its blocks',
	static function () {
		$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'MCP', 'post_content' => '<!-- wp:auvyx/heading {"level":1} --><h1 class="wp-block-auvyx-heading">Hello</h1><!-- /wp:auvyx/heading -->' ) );
		$r  = auvyx_mcp_request( 'GET', '/auvyx/v1/mcp/document/' . $id );
		auvyx_assert_same( 200, $r->get_status() );
		$d = $r->get_data();
		auvyx_assert_same( 'pages', $d['restBase'] );
		auvyx_assert_same( 'auvyx/heading', $d['blocks'][0]['block'] );
		auvyx_assert_same( \Auvyx\Builder\Modules\Mcp\Writes::version( get_post( $id ) ), $d['version'], 'the version a save must send back' );
		auvyx_assert_same( false, $d['pending'] );
		auvyx_assert_same( 401, auvyx_mcp_request( 'GET', '/auvyx/v1/mcp/document/' . $id, array(), 0 )->get_status() );
		wp_delete_post( $id, true );
	}
);

auvyx_test(
	'mcp: a preview link shows its draft to its holder, only that draft, only on the main query',
	static function () {
		global $wp_the_query;
		$id    = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Draft' ) );
		$other = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Other' ) );
		$link  = auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/preview/' . $id )->get_data()['url'];
		parse_str( (string) wp_parse_url( $link, PHP_URL_QUERY ), $args );
		auvyx_assert_same( $id, (int) $args['page_id'] );
		$mcp   = new Mcp();
		$query = new WP_Query();
		$saved = $wp_the_query;
		$wp_the_query      = $query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		$_GET[ Mcp::PREVIEW_ARG ] = $args[ Mcp::PREVIEW_ARG ];
		auvyx_assert_same( 'publish', $mcp->preview( array( get_post( $id ) ), $query )[0]->post_status );
		auvyx_assert_same( 'draft', $mcp->preview( array( get_post( $other ) ), $query )[0]->post_status, 'another draft stays hidden' );
		$_GET[ Mcp::PREVIEW_ARG ] = 'wrong';
		auvyx_assert_same( 'draft', $mcp->preview( array( get_post( $id ) ), $query )[0]->post_status, 'a wrong token shows nothing' );
		unset( $_GET[ Mcp::PREVIEW_ARG ] );
		$wp_the_query = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		auvyx_assert_same( 401, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/preview/' . $id, array(), 0 )->get_status(), 'no link without the right to edit' );
		wp_delete_post( $id, true );
		wp_delete_post( $other, true );
	}
);

auvyx_test(
	'mcp: the front page is set by an administrator only',
	static function () {
		$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Home' ) );
		auvyx_assert_same( 401, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/front-page', array( 'id' => $id ), 0 )->get_status() );
		$was_show = get_option( 'show_on_front' );
		$was_page = get_option( 'page_on_front' );
		auvyx_assert_same( 200, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/front-page', array( 'id' => $id ) )->get_status() );
		auvyx_assert_same( $id, (int) get_option( 'page_on_front' ) );
		update_option( 'show_on_front', $was_show );
		update_option( 'page_on_front', $was_page );
		wp_delete_post( $id, true );
	}
);

auvyx_test(
	'mcp: the vibe is kept by those who may change the look; the site answer names it and the fonts',
	static function () {
		auvyx_assert_same( 401, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/vibe', array( 'id' => 'launch' ), 0 )->get_status() );
		auvyx_assert_same( 200, auvyx_mcp_request( 'POST', '/auvyx/v1/mcp/vibe', array( 'id' => 'Launch!' ) )->get_status() );
		auvyx_assert_same( 'launch', get_option( Mcp::VIBE_OPTION ), 'kept as a key' );
		$d = auvyx_mcp_request( 'GET', '/auvyx/v1/mcp/site' )->get_data();
		auvyx_assert_same( 'launch', $d['vibe'] );
		auvyx_assert_same( true, is_array( $d['fonts'] ) );
		delete_option( Mcp::VIBE_OPTION );
	}
);
