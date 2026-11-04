<?php
/**
 * AI connections (Modules/McpAccess) and MCP v2's safe writes (Modules/Mcp): tokens, scopes, the allowlist, the rate
 * limit, the audit log, version checks, drafts by default, revisions, trash, code that waits, plugins' tools.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Mcp\Pending;
use Auvyx\Builder\Modules\Mcp\Writes;
use Auvyx\Builder\Modules\McpAccess\Audit;
use Auvyx\Builder\Modules\McpAccess\McpAccess;
use Auvyx\Builder\Modules\McpAccess\Screen;
use Auvyx\Builder\Modules\McpAccess\Tokens;

/** A token with these scopes, made by the administrator (user 1). */
function auvyx_mcpa_token( array $scopes, string $name = 'Test AI' ): string {
	$made = Tokens::create( $name, $scopes, 90, 1 );
	if ( is_wp_error( $made ) ) {
		throw new RuntimeException( $made->get_error_message() );
	}
	return $made['token'];
}

/** A REST request carrying a bearer token, through authentication, dispatch and post-dispatch as serve_request does. */
function auvyx_mcpa_call( string $token, string $method, string $route, array $params = array(), array $headers = array(), ?callable $inside = null ): WP_REST_Response {
	McpAccess::reset();
	$home                          = untrailingslashit( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ) );
	$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
	$_SERVER['REQUEST_URI']        = $home . '/' . rest_get_url_prefix() . $route;
	$_SERVER['REMOTE_ADDR']        = '203.0.113.9';
	wp_set_current_user( (int) apply_filters( 'determine_current_user', false ) );
	kses_init(); // as on a fresh request (wp_set_current_user skips the action when the id does not change)
	$request = new WP_REST_Request( $method, $route );
	foreach ( $params as $k => $v ) {
		$request->set_param( $k, $v );
	}
	foreach ( $headers as $k => $v ) {
		$request->set_header( $k, $v );
	}
	$error    = apply_filters( 'rest_authentication_errors', null );
	$response = is_wp_error( $error ) ? rest_convert_error_to_response( $error ) : rest_do_request( $request );
	if ( null !== $inside ) {
		$inside( $request );
	}
	$response = apply_filters( 'rest_post_dispatch', rest_ensure_response( $response ), rest_get_server(), $request );
	unset( $_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REQUEST_URI'] );
	McpAccess::reset();
	wp_set_current_user( 1 );
	kses_init();
	return $response;
}

function auvyx_mcpa_error( WP_REST_Response $r ): string {
	$d = $r->get_data();
	return is_array( $d ) && isset( $d['code'] ) ? (string) $d['code'] : '';
}

function auvyx_mcpa_page( string $status, string $content = '<!-- wp:auvyx/text --><p class="wp-block-auvyx-text">One</p><!-- /wp:auvyx/text -->' ): int {
	wp_set_current_user( 1 );
	return (int) wp_insert_post(
		array(
			'post_type'    => 'page',
			'post_status'  => $status,
			'post_title'   => 'MCP v2',
			'post_content' => $content,
		)
	);
}

function auvyx_mcpa_clean(): void {
	delete_option( Tokens::OPTION );
	delete_option( Audit::OPTION );
	delete_transient( 'auvyx_mcp_fail_' . md5( '203.0.113.9' ) );
}

const AUVYX_MCPA_TEXT2 = '<!-- wp:auvyx/text --><p class="wp-block-auvyx-text">Two</p><!-- /wp:auvyx/text -->';
const AUVYX_MCPA_CODE  = '<!-- wp:auvyx/section {"auvyx":{"v":1,"code":{"markup":"<canvas></canvas>","script":"export default () => {}","libs":[],"uses":[]}}} --><div class="wp-block-auvyx-section"></div><!-- /wp:auvyx/section -->';

auvyx_test(
	'mcp access: a token is shown once, kept as an HMAC of its secret, verified in constant time, expires and is revoked',
	static function () {
		auvyx_mcpa_clean();
		$made   = Tokens::create( 'Laptop', array( 'draft', 'publish', 'bogus' ), 30, 1 );
		$token  = $made['token'];
		$secret = substr( $token, strrpos( $token, '_' ) + 1 );
		auvyx_assert_same( 1, preg_match( '/^auvyxmcp_[a-f0-9]{8}_[a-f0-9]{40}$/', $token ) );
		$stored = Tokens::all()[0];
		auvyx_assert_not_contains( $secret, (string) wp_json_encode( get_option( Tokens::OPTION ) ), 'the secret is never stored' );
		auvyx_assert_same( hash_hmac( 'sha256', $secret, wp_salt( 'auth' ) ), $stored['hash'] );
		auvyx_assert_same( array( 'read', 'draft', 'publish' ), $stored['scopes'], 'read always, unknown scopes dropped' );
		auvyx_assert_same( false, isset( $made['record']['hash'] ), 'the answer carries no hash' );
		auvyx_assert_same( true, abs( $stored['expires'] - ( time() + 30 * DAY_IN_SECONDS ) ) < 5 );
		auvyx_assert_same( $stored['id'], Tokens::verify( $token )['id'] );
		auvyx_assert_same( 'auvyx_mcp_token', Tokens::verify( substr( $token, 0, -1 ) . ( '0' === substr( $token, -1 ) ? '1' : '0' ) )->get_error_code(), 'a wrong secret' );
		auvyx_assert_same( true, is_wp_error( Tokens::verify( 'auvyxmcp_nothing' ) ) );
		$editor = wp_insert_user( array( 'user_login' => 'mcpa_editor', 'user_pass' => wp_generate_password(), 'role' => 'editor' ) );
		auvyx_assert_same( 'auvyx_mcp_user', Tokens::create( 'X', array(), 90, $editor )->get_error_code(), 'only administrators make connections' );
		auvyx_assert_same( false, in_array( 'code', Tokens::grantable( wp_insert_user( array( 'user_login' => 'mcpa_author', 'user_pass' => wp_generate_password(), 'role' => 'author' ) ) ), true ), 'never above the user' );
		// Expired.
		$tokens               = get_option( Tokens::OPTION );
		$tokens[0]['expires'] = time() - 1;
		update_option( Tokens::OPTION, $tokens );
		auvyx_assert_same( 401, Tokens::verify( $token )->get_error_data()['status'] );
		$tokens[0]['expires'] = time() + 60;
		update_option( Tokens::OPTION, $tokens );
		auvyx_assert_same( true, is_array( Tokens::verify( $token ) ) );
		auvyx_assert_same( true, Tokens::revoke( $stored['id'] ) );
		auvyx_assert_same( 'auvyx_mcp_token', Tokens::verify( $token )->get_error_code(), 'revoked' );
		$r = auvyx_mcpa_call( $token, 'GET', '/auvyx/v1/mcp/site' );
		auvyx_assert_same( 401, $r->get_status() );
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $editor );
		wp_delete_user( (int) get_user_by( 'login', 'mcpa_author' )->ID );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp access: a token acts as its administrator on allowlisted routes only, within its scopes',
	static function () {
		auvyx_mcpa_clean();
		$read = auvyx_mcpa_token( array() );
		$r    = auvyx_mcpa_call( $read, 'GET', '/auvyx/v1/mcp/site' );
		auvyx_assert_same( 200, $r->get_status() );
		auvyx_assert_same( array( 'read' ), $r->get_data()['scopes'] );
		auvyx_assert_same( false, $r->get_data()['canScript'], 'no code scope: no scripting' );
		auvyx_assert_same( false, $r->get_data()['canSetFront'], 'no publish scope: no front page' );
		auvyx_assert_same( 200, auvyx_mcpa_call( $read, 'GET', '/wp/v2/pages', array( 'context' => 'edit' ) )->get_status(), 'pages may be listed' );
		$id = auvyx_mcpa_page( 'draft' );
		$r  = auvyx_mcpa_call( $read, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => AUVYX_MCPA_TEXT2, 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( 403, $r->get_status() );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( $r ) );
		auvyx_assert_same( 'draft', $r->get_data()['data']['scope'] );
		$r = auvyx_mcpa_call( $read, 'GET', '/wp/v2/users' );
		auvyx_assert_same( 403, $r->get_status(), 'a route off the allowlist' );
		auvyx_assert_same( 'auvyx_mcp_route', auvyx_mcpa_error( $r ) );
		$draft = auvyx_mcpa_token( array( 'draft' ) );
		$r     = auvyx_mcpa_call( $draft, 'POST', '/wp/v2/pages/' . $id, array( 'content' => 'x' ) );
		auvyx_assert_same( 'auvyx_mcp_route', auvyx_mcpa_error( $r ), 'pages are never written through wp/v2' );
		auvyx_assert_same( 'auvyx_mcp_route', auvyx_mcpa_error( auvyx_mcpa_call( $draft, 'POST', '/wp/v2/pages', array( 'title' => 'x' ) ) ) );
		auvyx_assert_same( 'auvyx_mcp_route', auvyx_mcpa_error( auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/pending/' . $id, array( 'decision' => 'approve' ) ) ), 'never its own approval' );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/front-page', array( 'id' => $id ) ) ) );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/design/brief', array( 'markdown' => '# x' ) ) ) );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/vibe', array( 'id' => 'launch' ) ) ) );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/trash/' . $id ) ) );
		$publish = auvyx_mcpa_token( array( 'draft', 'publish' ) );
		auvyx_assert_same( 200, auvyx_mcpa_call( $publish, 'POST', '/auvyx/v1/mcp/vibe', array( 'id' => 'launch' ) )->get_status() );
		delete_option( 'auvyx_mcp_vibe' );
		// The token governs even with a cookie user present: it is never widened.
		auvyx_assert_same( 0, (int) ( function () use ( $read ) {
			McpAccess::reset();
			$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $read;
			$_SERVER['REQUEST_URI']        = '/' . rest_get_url_prefix() . '/wp/v2/settings';
			$user                          = apply_filters( 'determine_current_user', 1 );
			unset( $_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REQUEST_URI'] );
			McpAccess::reset();
			return $user;
		} )(), 'a cookie user on a refused route becomes nobody' );
		// Not a REST request: the token is ignored.
		McpAccess::reset();
		$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $read;
		$_SERVER['REQUEST_URI']        = '/wp-admin/';
		auvyx_assert_same( false, apply_filters( 'determine_current_user', false ) );
		unset( $_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REQUEST_URI'] );
		McpAccess::reset();
		wp_delete_post( $id, true );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp access: a media DELETE needs the delete scope and is forced to the trash (force=false)',
	static function () {
		auvyx_mcpa_clean();
		$file = wp_insert_attachment( array( 'post_title' => 'pic', 'post_mime_type' => 'image/png', 'post_status' => 'inherit' ) );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( auvyx_mcpa_call( auvyx_mcpa_token( array( 'draft' ) ), 'DELETE', '/wp/v2/media/' . $file, array( 'force' => true ) ) ) );
		$force = null;
		auvyx_mcpa_call(
			auvyx_mcpa_token( array( 'draft', 'delete' ) ),
			'DELETE',
			'/wp/v2/media/' . $file,
			array( 'force' => true ),
			array(),
			static function ( $request ) use ( &$force ) {
				$force = $request->get_param( 'force' );
			}
		);
		auvyx_assert_same( false, $force );
		auvyx_assert_same( true, get_post( $file ) instanceof WP_Post, 'never deleted for good' );
		wp_delete_post( $file, true );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp v2: saves check the version (409), stay drafts without publish, and record revisions',
	static function () {
		auvyx_mcpa_clean();
		$draft   = auvyx_mcpa_token( array( 'draft' ), 'Drafter' );
		$publish = auvyx_mcpa_token( array( 'draft', 'publish' ), 'Publisher' );
		// A draft page: saved as a draft; asking to publish without the scope stays a draft.
		$id = auvyx_mcpa_page( 'draft' );
		$d  = auvyx_mcpa_call( $draft, 'GET', '/auvyx/v1/mcp/document/' . $id )->get_data();
		auvyx_assert_same( Writes::version( get_post( $id ) ), $d['version'] );
		$r = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => AUVYX_MCPA_TEXT2, 'version' => $d['version'], 'status' => 'publish' ) );
		auvyx_assert_same( 200, $r->get_status() );
		auvyx_assert_same( 'draft', $r->get_data()['status'] );
		auvyx_assert_same( 'draft', $r->get_data()['where'] );
		auvyx_assert_same( 'draft', $r->get_data()['forced'] );
		auvyx_assert_contains( 'auvyx_preview=', $r->get_data()['preview'] );
		auvyx_assert_contains( 'Two', get_post( $id )->post_content );
		// The old version is stale now.
		$r = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => AUVYX_MCPA_TEXT2, 'version' => $d['version'] ) );
		auvyx_assert_same( 409, $r->get_status() );
		auvyx_assert_same( 'auvyx_mcp_conflict', auvyx_mcpa_error( $r ) );
		auvyx_assert_same( Writes::version( get_post( $id ) ), $r->get_data()['data']['version'] );
		// With publish: live.
		$r = auvyx_mcpa_call( $publish, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => AUVYX_MCPA_TEXT2 . AUVYX_MCPA_TEXT2, 'version' => Writes::version( get_post( $id ) ), 'status' => 'publish' ) );
		auvyx_assert_same( 'live', $r->get_data()['where'] );
		auvyx_assert_same( 'publish', get_post_status( $id ) );
		// A published page without publish: an autosave, the live content untouched.
		$live = get_post( $id )->post_content;
		wp_set_current_user( 1 );
		$r = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => '<!-- wp:auvyx/text --><p class="wp-block-auvyx-text">Proposed</p><!-- /wp:auvyx/text -->', 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( 'autosave', $r->get_data()['where'] );
		auvyx_assert_same( $live, get_post( $id )->post_content, 'live content untouched' );
		$autosave = wp_get_post_autosave( $id, 1 );
		auvyx_assert_contains( 'Proposed', $autosave->post_content );
		auvyx_assert_same( 'mcp:Drafter', get_metadata( 'post', $autosave->ID, Writes::VIA_META, true ) );
		// The preview link shows the autosave.
		parse_str( (string) wp_parse_url( $r->get_data()['preview'], PHP_URL_QUERY ), $args );
		$_GET['auvyx_preview'] = $args['auvyx_preview'];
		$query              = new WP_Query();
		$saved              = $GLOBALS['wp_the_query'];
		$GLOBALS['wp_the_query'] = $query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		auvyx_assert_contains( 'Proposed', ( new \Auvyx\Builder\Modules\Mcp\Mcp() )->preview( array( get_post( $id ) ), $query )[0]->post_content );
		$GLOBALS['wp_the_query'] = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		unset( $_GET['auvyx_preview'] );
		auvyx_assert_same( $live, get_post( $id )->post_content, 'the preview changed nothing' );
		// Revisions: newest first, with the connection that made them; restore one.
		$r    = auvyx_mcpa_call( $draft, 'GET', '/auvyx/v1/mcp/revisions/' . $id );
		$revs = $r->get_data()['revisions'];
		auvyx_assert_same( true, count( $revs ) >= 2 && count( $revs ) <= 20 );
		auvyx_assert_same( true, in_array( 'mcp:Publisher', array_column( $revs, 'via' ), true ) );
		$first = null;
		foreach ( $revs as $rev ) {
			if ( ! $rev['autosave'] && 'mcp:Drafter' === $rev['via'] ) {
				$first = $rev['id'];
			}
		}
		auvyx_assert_same( true, null !== $first, 'the draft save left a revision' );
		$r = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/restore/' . $id, array( 'revision' => $first ) );
		auvyx_assert_same( 'autosave', $r->get_data()['where'], 'restoring a published page without publish goes to the autosave' );
		$r = auvyx_mcpa_call( $publish, 'POST', '/auvyx/v1/mcp/restore/' . $id, array( 'revision' => $first ) );
		auvyx_assert_same( 'live', $r->get_data()['where'] );
		auvyx_assert_same( AUVYX_MCPA_TEXT2, get_post( $id )->post_content );
		auvyx_assert_same( 404, auvyx_mcpa_call( $publish, 'POST', '/auvyx/v1/mcp/restore/' . $id, array( 'revision' => $id ) )->get_status(), 'only its own revisions' );
		wp_delete_post( $id, true );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp v2: pages are created as drafts and go to the trash, never deleted for good',
	static function () {
		auvyx_mcpa_clean();
		$draft = auvyx_mcpa_token( array( 'draft' ) );
		$r     = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/pages', array( 'title' => 'Fresh', 'content' => AUVYX_MCPA_TEXT2 ) );
		auvyx_assert_same( 201, $r->get_status() );
		$id = (int) $r->get_data()['id'];
		auvyx_assert_same( 'draft', get_post_status( $id ) );
		auvyx_assert_contains( 'Two', get_post( $id )->post_content );
		auvyx_assert_same( 'auvyx_mcp_route', auvyx_mcpa_error( auvyx_mcpa_call( auvyx_mcpa_token( array( 'draft', 'delete' ) ), 'DELETE', '/wp/v2/pages/' . $id ) ) );
		$r = auvyx_mcpa_call( auvyx_mcpa_token( array( 'draft', 'delete' ) ), 'POST', '/auvyx/v1/mcp/trash/' . $id );
		auvyx_assert_same( 200, $r->get_status() );
		auvyx_assert_same( 'trash', get_post_status( $id ) );
		auvyx_assert_same( true, get_post( $id ) instanceof WP_Post );
		wp_delete_post( $id, true );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp v2: code without the code scope waits for an administrator, who approves or discards it in the editor',
	static function () {
		auvyx_mcpa_clean();
		$draft = auvyx_mcpa_token( array( 'draft' ), 'Drafter' );
		$id    = auvyx_mcpa_page( 'draft' );
		$was   = get_post( $id )->post_content;
		$r     = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => AUVYX_MCPA_TEXT2 . AUVYX_MCPA_CODE, 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( 200, $r->get_status() );
		auvyx_assert_same( array( '1' ), $r->get_data()['pendingCode'] );
		auvyx_assert_same( $was, get_post( $id )->post_content, 'the page is untouched' );
		$pending = Pending::get( $id );
		auvyx_assert_same( 'Drafter', $pending['token'] );
		auvyx_assert_same( AUVYX_MCPA_TEXT2 . AUVYX_MCPA_CODE, $pending['content'] );
		auvyx_assert_same( true, auvyx_mcpa_call( $draft, 'GET', '/auvyx/v1/mcp/document/' . $id )->get_data()['pending'] );
		// A raw script is code too.
		$r = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => '<!-- wp:html --><script>alert(1)</script><!-- /wp:html -->', 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( array( '0' ), $r->get_data()['pendingCode'] );
		auvyx_assert_same( $was, get_post( $id )->post_content );
		// Put the code proposal back and show it to the editor.
		auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => AUVYX_MCPA_TEXT2 . AUVYX_MCPA_CODE, 'version' => Writes::version( get_post( $id ) ) ) );
		wp_set_current_user( 1 );
		$config = Pending::config( get_post( $id ) );
		auvyx_assert_same( 'Drafter', $config['token'] );
		auvyx_assert_same( '1', $config['elements'][0]['id'] );
		auvyx_assert_contains( 'canvas', $config['elements'][0]['code'] );
		auvyx_assert_same( 'auvyx/v1/mcp/pending/' . $id, $config['route'] );
		// The approval needs the REST nonce of a signed-in person.
		$approve = static function ( array $headers ) use ( $id ) {
			$request = new WP_REST_Request( 'POST', '/auvyx/v1/mcp/pending/' . $id );
			$request->set_param( 'decision', 'approve' );
			foreach ( $headers as $k => $v ) {
				$request->set_header( $k, $v );
			}
			return rest_do_request( $request );
		};
		auvyx_assert_same( 403, $approve( array() )->get_status(), 'no nonce, no approval' );
		$editor = wp_insert_user( array( 'user_login' => 'mcpa_author2', 'user_pass' => wp_generate_password(), 'role' => 'author' ) );
		wp_set_current_user( $editor );
		auvyx_assert_same( 403, $approve( array( 'X-WP-Nonce' => wp_create_nonce( 'wp_rest' ) ) )->get_status(), 'only who may script and edit' );
		wp_set_current_user( 1 );
		$r = $approve( array( 'X-WP-Nonce' => wp_create_nonce( 'wp_rest' ) ) );
		auvyx_assert_same( 200, $r->get_status() );
		auvyx_assert_contains( '"code":', get_post( $id )->post_content, 'the approved code is saved' );
		auvyx_assert_same( null, Pending::get( $id ) );
		auvyx_assert_same( null, Pending::config( get_post( $id ) ) );
		// Editing around the approved code with a draft token keeps it (nothing new to approve).
		$text3 = '<!-- wp:auvyx/text --><p class="wp-block-auvyx-text">Three</p><!-- /wp:auvyx/text -->';
		$r     = auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => $text3 . AUVYX_MCPA_CODE, 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( false, isset( $r->get_data()['pendingCode'] ) );
		auvyx_assert_contains( 'Three', get_post( $id )->post_content );
		auvyx_assert_contains( 'export default', get_post( $id )->post_content, 'existing code survives' );
		// Discard.
		$changed = str_replace( '<canvas></canvas>', '<svg></svg>', AUVYX_MCPA_CODE );
		auvyx_mcpa_call( $draft, 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => $text3 . $changed, 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( true, null !== Pending::get( $id ), 'changed code waits too' );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/mcp/pending/' . $id );
		$request->set_param( 'decision', 'discard' );
		$request->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
		auvyx_assert_same( 200, rest_do_request( $request )->get_status() );
		auvyx_assert_same( null, Pending::get( $id ) );
		// With the code scope it saves at once.
		$r = auvyx_mcpa_call( auvyx_mcpa_token( array( 'draft', 'code' ) ), 'POST', '/auvyx/v1/mcp/save/' . $id, array( 'content' => $text3 . $changed, 'version' => Writes::version( get_post( $id ) ) ) );
		auvyx_assert_same( false, isset( $r->get_data()['pendingCode'] ) );
		auvyx_assert_contains( 'svg', get_post( $id )->post_content );
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $editor );
		wp_delete_post( $id, true );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp access: failed lookups are limited per IP (429), and every token request is audited without the token',
	static function () {
		auvyx_mcpa_clean();
		$good = auvyx_mcpa_token( array(), 'Audited' );
		auvyx_assert_same( 200, auvyx_mcpa_call( $good, 'GET', '/auvyx/v1/mcp/site' )->get_status() );
		$log  = Audit::all();
		$last = end( $log );
		auvyx_assert_same( 'Audited', $last['name'] );
		auvyx_assert_same( 200, $last['code'] );
		auvyx_assert_same( '/auvyx/v1/mcp/site', $last['route'] );
		for ( $i = 0; $i < McpAccess::FAIL_LIMIT; $i++ ) {
			auvyx_assert_same( 401, auvyx_mcpa_call( 'auvyxmcp_00000000_' . str_repeat( '0', 40 ), 'GET', '/auvyx/v1/mcp/site' )->get_status() );
		}
		$r = auvyx_mcpa_call( $good, 'GET', '/auvyx/v1/mcp/site' );
		auvyx_assert_same( 429, $r->get_status(), 'even a good token waits once the limit is hit' );
		auvyx_assert_same( 'auvyx_mcp_rate', auvyx_mcpa_error( $r ) );
		$secret = substr( $good, strrpos( $good, '_' ) + 1 );
		auvyx_assert_not_contains( $secret, (string) wp_json_encode( Audit::all() ) );
		$log  = Audit::all();
		$last = end( $log );
		auvyx_assert_same( 429, $last['code'] );
		delete_transient( 'auvyx_mcp_fail_' . md5( '203.0.113.9' ) );
		auvyx_assert_same( 200, auvyx_mcpa_call( $good, 'GET', '/auvyx/v1/mcp/site' )->get_status() );
		for ( $i = 0; $i < Audit::SIZE + 5; $i++ ) {
			Audit::add( array( 'route' => '/x', 'code' => 200 ) );
		}
		auvyx_assert_same( Audit::SIZE, count( Audit::all() ), 'a ring of 500' );
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp access: plugins add tools through auvyx_mcp_tools; the site lists the valid ones and their scope is enforced',
	static function () {
		auvyx_mcpa_clean();
		$route = static function () {
			register_rest_route(
				'auvyx-test/v1',
				'/ping/(?P<id>\d+)',
				array(
					'methods'             => 'POST',
					'callback'            => static fn() => array( 'pong' => true ),
					'permission_callback' => static fn() => current_user_can( 'edit_pages' ),
				)
			);
		};
		add_action( 'rest_api_init', $route );
		$GLOBALS['wp_rest_server'] = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- rebuilt with the route
		$tools = static fn() => array(
			array( 'name' => 'x_test_ping', 'description' => 'Ping', 'input_schema' => array( 'type' => 'object' ), 'route' => '/auvyx-test/v1/ping/(?P<id>\d+)', 'method' => 'POST', 'scope' => 'publish', 'annotations' => array( 'readOnlyHint' => false ) ),
			array( 'name' => 'Bad name!', 'route' => '/auvyx-test/v1/ping', 'method' => 'POST', 'scope' => 'read' ),
			array( 'name' => 'test_get', 'route' => '/auvyx-test/v1/ping/{id}', 'method' => 'GET', 'scope' => 'read' ),
			array( 'name' => 'x_test_users', 'route' => '/wp/v2/users', 'method' => 'GET', 'scope' => 'read' ),
			array( 'name' => 'x_test_bad', 'route' => '/auvyx-test/v1/ping', 'method' => 'POST', 'scope' => 'root' ),
		);
		add_filter( 'auvyx_mcp_tools', $tools );
		$d = auvyx_mcpa_call( auvyx_mcpa_token( array() ), 'GET', '/auvyx/v1/mcp/site' )->get_data();
		auvyx_assert_same( array( 'x_test_ping', 'x_test_get' ), array_column( $d['extensions'], 'name' ), 'x_ added; bad names, core routes and unknown scopes dropped' );
		auvyx_assert_same( 'auvyx_mcp_route', auvyx_mcpa_error( auvyx_mcpa_call( auvyx_mcpa_token( array() ), 'GET', '/auvyx-test/v1/ping/x/y' ) ), 'a {id} is one segment' );
		auvyx_assert_same( 'publish', $d['extensions'][0]['scope'] );
		auvyx_assert_same( 'auvyx_mcp_scope', auvyx_mcpa_error( auvyx_mcpa_call( auvyx_mcpa_token( array( 'draft' ) ), 'POST', '/auvyx-test/v1/ping/3' ) ) );
		$r = auvyx_mcpa_call( auvyx_mcpa_token( array( 'draft', 'publish' ) ), 'POST', '/auvyx-test/v1/ping/3' );
		auvyx_assert_same( 200, $r->get_status() );
		auvyx_assert_same( array( 'pong' => true ), $r->get_data() );
		remove_filter( 'auvyx_mcp_tools', $tools );
		remove_action( 'rest_api_init', $route );
		$GLOBALS['wp_rest_server'] = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		auvyx_mcpa_clean();
	}
);

auvyx_test(
	'mcp access: the AI connections screen shows a new token once, escaped, with configs for each client',
	static function () {
		auvyx_mcpa_clean();
		wp_set_current_user( 1 );
		$_POST    = array(
			'auvyx_mcp_action' => 'create',
			'auvyx_mcp_name'   => '<b>Claude</b>',
			'auvyx_mcp_scopes' => array( 'draft' ),
			'auvyx_mcp_days'   => '365',
			'_wpnonce'      => wp_create_nonce( 'auvyx-mcp-create' ),
		);
		$_REQUEST = $_POST;
		ob_start();
		( new Screen() )->render();
		$html = (string) ob_get_clean();
		$_POST    = array();
		$_REQUEST = array();
		auvyx_assert_same( 1, preg_match( '/auvyxmcp_[a-f0-9]{8}_[a-f0-9]{40}/', $html, $m ) );
		auvyx_assert_contains( 'claude mcp add auvyx -e AUVYX_SITE=', $html );
		auvyx_assert_contains( '&quot;mcpServers&quot;', $html );
		auvyx_assert_contains( 'Authorization: Bearer ' . $m[0], $html );
		auvyx_assert_not_contains( '<b>Claude</b>', $html, 'names are escaped' );
		auvyx_assert_same( true, is_array( Tokens::verify( $m[0] ) ) );
		ob_start();
		( new Screen() )->render();
		auvyx_assert_not_contains( $m[0], (string) ob_get_clean(), 'shown once' );
		$configs = Screen::configs( 'auvyxmcp_x' );
		auvyx_assert_same( 4, count( $configs ) );
		auvyx_mcpa_clean();
	}
);
