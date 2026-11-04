<?php
/**
 * What the AI connections did: an option-backed ring buffer of the last 500 token requests (time, token, user, route,
 * method, post, result). Never the token itself, never a request body.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\McpAccess;

defined( 'ABSPATH' ) || exit;

final class Audit {

	public const OPTION = 'auvyx_mcp_audit';
	public const SIZE   = 500;

	/**
	 * @param array<string, mixed> $entry time, token, name, user, route, method, post, code.
	 */
	public static function add( array $entry ): void {
		$log   = self::all();
		$log[] = array(
			'time'   => time(),
			'token'  => substr( sanitize_key( (string) ( $entry['token'] ?? '' ) ), 0, 40 ),
			'name'   => mb_substr( (string) ( $entry['name'] ?? '' ), 0, 80 ),
			'user'   => (int) ( $entry['user'] ?? 0 ),
			'route'  => mb_substr( (string) ( $entry['route'] ?? '' ), 0, 200 ),
			'method' => substr( strtoupper( (string) ( $entry['method'] ?? '' ) ), 0, 10 ),
			'post'   => (int) ( $entry['post'] ?? 0 ),
			'code'   => (int) ( $entry['code'] ?? 0 ),
		);
		if ( count( $log ) > self::SIZE ) {
			$log = array_slice( $log, -self::SIZE );
		}
		update_option( self::OPTION, $log, false );
	}

	/**
	 * Oldest first.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function all(): array {
		$log = get_option( self::OPTION, array() );
		return is_array( $log ) ? array_values( array_filter( $log, 'is_array' ) ) : array();
	}
}
