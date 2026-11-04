<?php
/**
 * What an Auvyx token may reach (docs/mcp-v2.md): the allowlist of routes, the scope each route + method needs, and the
 * tools plugins add through `auvyx_mcp_tools`.
 *
 * Pages are written only through `auvyx/v1/mcp/*` (create, save with a version check, restore, trash): a token may read
 * `wp/v2/pages` but never write it, so the version check, drafts-by-default and code-waits rules cannot be bypassed.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\McpAccess;

defined( 'ABSPATH' ) || exit;

final class Rules {

	/** Route prefixes a token may reach (with a `/` boundary). */
	private const ALLOW = array( '/auvyx/v1/mcp', '/auvyx/v1/design/brief', '/wp/v2/pages', '/wp/v2/media' );

	/** Never reachable with a token, even under an allowed prefix: an AI never approves its own code. */
	private const DENY = array( '/auvyx/v1/mcp/pending' );

	/** An extension may not claim these namespaces. */
	private const RESERVED = array( '/wp/', '/wp-site-health/', '/batch/', '/oembed/', '/auvyx/v1/mcp', '/auvyx/v1/design' );

	private const READ_METHODS = array( 'GET', 'HEAD', 'OPTIONS' );

	public static function normalize( string $route ): string {
		$route = strtolower( '/' . ltrim( rawurldecode( $route ), '/' ) );
		return '/' === $route ? $route : untrailingslashit( $route );
	}

	private static function under( string $route, string $prefix ): bool {
		return $route === $prefix || 0 === strpos( $route, $prefix . '/' );
	}

	/**
	 * Whether a token may reach this route at all (any method).
	 *
	 * @param array<int, array<string, mixed>>|null $extensions Defaults to the filtered tools.
	 */
	public static function allowed( string $route, ?array $extensions = null ): bool {
		$route = self::normalize( $route );
		foreach ( self::DENY as $deny ) {
			if ( self::under( $route, $deny ) ) {
				return false;
			}
		}
		foreach ( self::ALLOW as $allow ) {
			if ( self::under( $route, $allow ) ) {
				return true;
			}
		}
		foreach ( null === $extensions ? self::extensions() : $extensions as $tool ) {
			if ( self::matches( (string) $tool['route'], $route ) ) {
				return true;
			}
		}
		return false;
	}

	/** A tool's route: WordPress's registered pattern (`(?P<id>\d+)`) or a `{id}` placeholder (one path segment). */
	private static function matches( string $pattern, string $route ): bool {
		$pattern = (string) preg_replace( '/\{([a-z_][a-z0-9_]*)\}/i', '(?P<$1>[^/]+)', $pattern );
		return 1 === preg_match( '@^' . $pattern . '$@i', $route );
	}

	/**
	 * The scope a request needs, or the refusal when no scope opens it.
	 *
	 * @param array<int, array<string, mixed>>|null $extensions Defaults to the filtered tools.
	 * @return string|\WP_Error
	 */
	public static function needed( string $method, string $route, ?array $extensions = null ) {
		$method = strtoupper( $method );
		$route  = self::normalize( $route );
		$read   = in_array( $method, self::READ_METHODS, true );
		if ( ! self::allowed( $route, $extensions ) ) {
			return self::route_error();
		}
		$claimed = false;
		foreach ( null === $extensions ? self::extensions() : $extensions as $tool ) {
			if ( self::matches( (string) $tool['route'], $route ) ) {
				if ( strtoupper( (string) $tool['method'] ) === $method ) {
					return (string) $tool['scope'];
				}
				$claimed = true;
			}
		}
		if ( $claimed && 'OPTIONS' !== $method && ! self::under( $route, '/auvyx/v1/mcp' ) ) {
			return self::route_error(); // a tool's route, with a method no tool declares
		}
		if ( self::under( $route, '/wp/v2/pages' ) ) {
			return $read ? 'read' : new \WP_Error(
				'auvyx_mcp_route',
				__( 'An Auvyx token writes pages only through auvyx/v1/mcp (pages, save, restore, trash).', 'auvyx-builder' ),
				array( 'status' => 403 )
			);
		}
		if ( self::under( $route, '/wp/v2/media' ) ) {
			return $read ? 'read' : ( 'DELETE' === $method ? 'delete' : 'draft' );
		}
		if ( $read ) {
			return 'read';
		}
		if ( '/auvyx/v1/design/brief' === $route ) {
			return 'publish';
		}
		if ( preg_match( '#^/auvyx/v1/mcp/(pages|save/\d+|restore/\d+)$#', $route ) ) {
			return 'draft';
		}
		if ( preg_match( '#^/auvyx/v1/mcp/trash/\d+$#', $route ) ) {
			return 'delete';
		}
		if ( preg_match( '#^/auvyx/v1/mcp/preview/\d+$#', $route ) ) {
			return 'read';
		}
		return 'publish'; // front-page, vibe, and any write route added later: the widest scope until it says otherwise.
	}

	public static function route_error(): \WP_Error {
		return new \WP_Error( 'auvyx_mcp_route', __( 'An Auvyx token cannot use this route.', 'auvyx-builder' ), array( 'status' => 403 ) );
	}

	/**
	 * Tools other plugins add (`auvyx_mcp_tools`), checked: a name `x_<plugin>_<tool>`, a route of their own (not a core or
	 * Auvyx MCP one), a method and one of the scopes.
	 *
	 * @return array<int, array{name: string, description: string, input_schema: array<string, mixed>, route: string, method: string, scope: string, annotations: array<string, bool>}>
	 */
	public static function extensions(): array {
		/**
		 * MCP tools a plugin adds. Each: { name: 'x_<plugin>_<tool>' (`x_` is added when missing), description, input_schema (JSON Schema), route (a
		 * REST route of that plugin, as registered, e.g. '/acme/v1/things/(?P<id>\d+)', or with `{id}` placeholders), method, scope (read|draft|publish|
		 * code|delete), annotations {readOnlyHint, destructiveHint, idempotentHint, openWorldHint} }. The route keeps its
		 * own permission_callback; McpAccess adds the scope.
		 *
		 * @param array<int, array<string, mixed>> $tools Tools.
		 */
		$items = (array) apply_filters( 'auvyx_mcp_tools', array() );
		$out   = array();
		$names = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$name   = strtolower( (string) ( $item['name'] ?? '' ) );
			$name   = 0 === strpos( $name, 'x_' ) ? $name : 'x_' . $name; // as the Node server names it
			$route  = (string) ( $item['route'] ?? '' );
			$method = strtoupper( (string) ( $item['method'] ?? 'GET' ) );
			$scope  = (string) ( $item['scope'] ?? '' );
			if ( ! preg_match( '/^x_[a-z0-9]+(_[a-z0-9]+)*$/', $name ) || strlen( $name ) > 64 || isset( $names[ $name ] ) || 0 !== strpos( $route, '/' ) || strlen( $route ) > 200
				|| ! in_array( $method, array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) || ! in_array( $scope, Tokens::SCOPES, true )
				|| false === @preg_match( '@^' . preg_replace( '/\{([a-z_][a-z0-9_]*)\}/i', '(?P<$1>[^/]+)', $route ) . '$@i', '' ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a plugin's invalid pattern is dropped, not a warning on every request
				continue;
			}
			$lower = strtolower( $route );
			foreach ( self::RESERVED as $reserved ) {
				if ( 0 === strpos( $lower, $reserved ) ) {
					continue 2;
				}
			}
			$annotations = array();
			foreach ( array( 'readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint' ) as $hint ) {
				if ( isset( $item['annotations'][ $hint ] ) ) {
					$annotations[ $hint ] = (bool) $item['annotations'][ $hint ];
				}
			}
			$names[ $name ] = true;
			$out[]          = array(
				'name'         => $name,
				'description'  => mb_substr( sanitize_textarea_field( (string) ( $item['description'] ?? '' ) ), 0, 1000 ),
				'input_schema' => isset( $item['input_schema'] ) && is_array( $item['input_schema'] ) ? $item['input_schema'] : array( 'type' => 'object' ),
				'route'        => $route,
				'method'       => $method,
				'scope'        => $scope,
				'annotations'  => $annotations,
			);
		}
		return $out;
	}
}
