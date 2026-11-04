<?php
/**
 * AI connections (docs/mcp-v2.md): an Auvyx MCP server (or any agent) reaches the site with a scoped, expiring, revocable
 * bearer token (`Authorization: Bearer auvyxmcp_…`) instead of a password.
 *
 * - `determine_current_user`: on an allowlisted REST route the token's user becomes the current user. A request that
 *   carries an Auvyx token is governed by it alone (a cookie on the same request does not widen it).
 * - `map_meta_cap`: while a token acts, its user loses what the token's scopes leave out (unfiltered_html without
 *   `code`, publishing without `publish`, deleting without `delete`); the token never gains a capability.
 * - `rest_pre_dispatch`: the scope each route + method needs (Rules); DELETE is forced to `force=false`.
 * - Failed lookups count per IP (10 a minute, then 429); every token request goes to the audit log.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\McpAccess;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class McpAccess implements Module {

	/** Failed lookups allowed per IP per minute. */
	public const FAIL_LIMIT = 10;

	/**
	 * This request's token: null when it carries none; otherwise the token (or null) and the refusal (or null).
	 *
	 * @var array{token: array<string, mixed>|null, error: \WP_Error|null, route: string}|null
	 */
	private static $state = null;

	/** @var bool While true, a token without `code` keeps its user's unfiltered_html (with_unfiltered). */
	private static $lift = false;

	public function id(): string {
		return 'mcp-access';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_filter( 'determine_current_user', array( $this, 'authenticate' ), 20 );
		add_filter( 'rest_authentication_errors', array( $this, 'authentication_errors' ), 5 );
		add_filter( 'rest_pre_dispatch', array( $this, 'pre_dispatch' ), 5, 3 );
		add_filter( 'rest_post_dispatch', array( $this, 'post_dispatch' ), 999, 3 );
		add_filter( 'map_meta_cap', array( $this, 'narrow' ), 999, 4 );
		add_filter( 'auvyx_builder_admin_tabs', array( new Screen(), 'tab' ), 50 );
	}

	// ---- for the routes ----------------------------------------------------------------------

	/** Whether this request acts through a (valid) Auvyx token. */
	public static function active(): bool {
		return null !== self::$state && null !== self::$state['token'];
	}

	/**
	 * The token acting in this request, or null.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function token(): ?array {
		return self::active() ? self::$state['token'] : null;
	}

	/** The name revisions and pending code record: `mcp:<token name>`, or `mcp` without a token. */
	public static function via(): string {
		$token = self::token();
		return null === $token ? 'mcp' : 'mcp:' . (string) $token['name'];
	}

	/**
	 * What the current request may do: the token's scopes (code only while its user has unfiltered_html), or, without a
	 * token (a signed-in person), what the user's capabilities allow.
	 *
	 * @return string[]
	 */
	public static function scopes(): array {
		$token = self::token();
		if ( null === $token ) {
			$user = get_current_user_id();
			return $user > 0 ? Tokens::grantable( $user ) : array();
		}
		$scopes = array_values( array_intersect( Tokens::SCOPES, (array) $token['scopes'] ) );
		if ( in_array( 'code', $scopes, true ) && ! current_user_can( 'unfiltered_html' ) ) {
			$scopes = array_values( array_diff( $scopes, array( 'code' ) ) );
		}
		return $scopes;
	}

	public static function can( string $scope ): bool {
		return in_array( $scope, self::scopes(), true );
	}

	/**
	 * Whether a token acts without `code` for a user who could script: what the user could save, the token may only
	 * propose (Writes keeps it aside for an administrator).
	 */
	public static function code_narrowed(): bool {
		$token = self::token();
		if ( null === $token || in_array( 'code', (array) $token['scopes'], true ) ) {
			return false;
		}
		self::$lift = true;
		$can        = current_user_can( 'unfiltered_html' );
		self::$lift = false;
		return $can;
	}

	/**
	 * Runs a write as the token's user with their own unfiltered_html (and no kses), for content Writes has checked adds
	 * nothing only a scripting user may save: the page's existing code elements and markup survive the save.
	 *
	 * @param callable $write The write.
	 * @return mixed What it returns.
	 */
	public static function with_unfiltered( callable $write ) {
		if ( ! self::code_narrowed() ) {
			return $write();
		}
		self::$lift = true;
		kses_remove_filters();
		try {
			return $write();
		} finally {
			self::$lift = false;
			kses_init();
		}
	}

	/** Forgets this request's token (tests; a long-running process between requests). */
	public static function reset(): void {
		self::$state = null;
		self::$lift  = false;
	}

	// ---- authentication ----------------------------------------------------------------------

	private static function header(): string {
		foreach ( array( 'HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION' ) as $key ) {
			if ( ! empty( $_SERVER[ $key ] ) ) {
				return trim( (string) wp_unslash( $_SERVER[ $key ] ) ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- a credential, compared, never printed or stored
			}
		}
		return '';
	}

	private static function ip(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return '' !== $ip ? $ip : 'unknown';
	}

	/**
	 * The REST route this request asks for, before WordPress has parsed it ('' when it is not a REST request).
	 */
	public static function requested_route(): string {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- routing, not a write
		if ( isset( $_GET['rest_route'] ) && is_string( $_GET['rest_route'] ) ) {
			return Rules::normalize( sanitize_text_field( wp_unslash( $_GET['rest_route'] ) ) );
		}
		// phpcs:enable
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- only compared against route prefixes
		$path = (string) wp_parse_url( $uri, PHP_URL_PATH );
		$home = untrailingslashit( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ) );
		foreach ( array( $home . '/' . rest_get_url_prefix() . '/', $home . '/index.php/' . rest_get_url_prefix() . '/' ) as $base ) {
			if ( 0 === strpos( $path, $base ) ) {
				return Rules::normalize( substr( $path, strlen( $base ) ) );
			}
		}
		return '';
	}

	private static function fail_key(): string {
		return 'auvyx_mcp_fail_' . md5( self::ip() );
	}

	private static function count_failure(): void {
		$key = self::fail_key();
		set_transient( $key, (int) get_transient( $key ) + 1, MINUTE_IN_SECONDS );
	}

	/**
	 * @param int|false $user_id Found so far.
	 * @return int|false
	 */
	public function authenticate( $user_id ) {
		$header = self::header();
		if ( 0 !== stripos( $header, 'bearer auvyxmcp_' ) ) {
			return $user_id; // not ours
		}
		if ( null !== self::$state ) {
			return null === self::$state['token'] ? 0 : (int) self::$state['token']['user_id'];
		}
		$route = self::requested_route();
		if ( '' === $route ) {
			return $user_id; // an Auvyx token is only for the REST API: anything else ignores it
		}
		self::$state = array(
			'token' => null,
			'error' => null,
			'route' => $route,
		);
		if ( (int) get_transient( self::fail_key() ) >= self::FAIL_LIMIT ) {
			self::$state['error'] = new \WP_Error( 'auvyx_mcp_rate', __( 'Too many failed Auvyx token attempts; wait a minute.', 'auvyx-builder' ), array( 'status' => 429 ) );
			return 0;
		}
		$token = Tokens::verify( trim( substr( $header, 7 ) ) );
		if ( is_wp_error( $token ) ) {
			self::count_failure();
			self::$state['error'] = $token;
			return 0;
		}
		if ( ! Rules::allowed( $route ) ) {
			self::$state['error'] = Rules::route_error();
			return 0;
		}
		self::$state['token'] = $token;
		Tokens::touch( (string) $token['id'] );
		return (int) $token['user_id'];
	}

	/**
	 * @param \WP_Error|true|null $result Earlier result.
	 * @return \WP_Error|true|null
	 */
	public function authentication_errors( $result ) {
		if ( null === self::$state || is_wp_error( $result ) ) {
			return $result;
		}
		if ( null !== self::$state['error'] ) {
			return self::$state['error'];
		}
		return null === $result ? true : $result;
	}

	/**
	 * The scope check, once the route is known.
	 *
	 * @param mixed            $result  Earlier result.
	 * @param \WP_REST_Server  $server  Server.
	 * @param \WP_REST_Request $request Request.
	 * @return mixed
	 */
	public function pre_dispatch( $result, $server, $request ) {
		if ( null === self::$state || ! $request instanceof \WP_REST_Request ) {
			return $result;
		}
		if ( null !== self::$state['error'] ) {
			return self::$state['error'];
		}
		if ( null !== $result ) {
			return $result;
		}
		$needed = Rules::needed( $request->get_method(), $request->get_route() );
		if ( is_wp_error( $needed ) ) {
			return $needed;
		}
		if ( ! self::can( $needed ) ) {
			return new \WP_Error(
				'auvyx_mcp_scope',
				/* translators: %s: a scope name (draft, publish, code, delete) */
				sprintf( __( 'This Auvyx token lacks the "%s" scope. The site owner can make a connection with it under Auvyx Builder → AI connections.', 'auvyx-builder' ), $needed ),
				array(
					'status' => 403,
					'scope'  => $needed,
				)
			);
		}
		if ( 'DELETE' === strtoupper( $request->get_method() ) ) {
			$request->set_param( 'force', false ); // the trash, never a permanent delete
		}
		return $result;
	}

	/**
	 * Every token request (refused ones included) goes to the audit log.
	 *
	 * @param \WP_HTTP_Response $response Response.
	 * @param \WP_REST_Server   $server   Server.
	 * @param \WP_REST_Request  $request  Request.
	 * @return \WP_HTTP_Response
	 */
	public function post_dispatch( $response, $server, $request ) {
		if ( null === self::$state ) {
			return $response;
		}
		$token = self::$state['token'];
		$post  = $request instanceof \WP_REST_Request ? $request->get_url_params()['id'] ?? 0 : 0;
		Audit::add(
			array(
				'token'  => null === $token ? '' : (string) $token['id'],
				'name'   => null === $token ? '' : (string) $token['name'],
				'user'   => null === $token ? 0 : (int) $token['user_id'],
				'route'  => $request instanceof \WP_REST_Request ? $request->get_route() : self::$state['route'],
				'method' => $request instanceof \WP_REST_Request ? $request->get_method() : '',
				'post'   => is_numeric( $post ) ? (int) $post : 0,
				'code'   => $response instanceof \WP_HTTP_Response ? $response->get_status() : 0,
			)
		);
		return $response;
	}

	/**
	 * While a token acts, its user keeps only what the token's scopes allow. Done on map_meta_cap (not user_has_cap) so it
	 * holds for a multisite super admin too, whose capabilities skip user_has_cap.
	 *
	 * @param string[]          $caps    Primitive capabilities required.
	 * @param string            $cap     Capability asked.
	 * @param int               $user_id User.
	 * @param array<int, mixed> $args    Object ids.
	 * @return string[]
	 */
	public function narrow( $caps, $cap, $user_id, $args ) {
		$token = self::token();
		if ( null === $token || (int) $user_id !== (int) $token['user_id'] ) {
			return $caps;
		}
		$scopes = (array) $token['scopes'];
		$drop   = array();
		if ( ! in_array( 'code', $scopes, true ) && ! self::$lift ) {
			$drop[] = 'unfiltered_html';
		}
		if ( ! in_array( 'publish', $scopes, true ) ) {
			$drop = array_merge( $drop, array( 'publish_posts', 'publish_pages', 'manage_options', 'edit_theme_options' ) );
		}
		foreach ( array_merge( array( (string) $cap ), array_map( 'strval', (array) $caps ) ) as $needed ) {
			if ( in_array( $needed, $drop, true ) || ( ! in_array( 'delete', $scopes, true ) && 0 === strpos( $needed, 'delete_' ) ) ) {
				return array( 'do_not_allow' );
			}
		}
		return $caps;
	}
}
