<?php
/**
 * The AI connections' access tokens (docs/mcp-v2.md): `auvyxmcp_<prefix>_<secret>`, shown once, kept only as an HMAC of the
 * secret (with the site's auth salt) beside a display prefix, the scopes, the expiry and the administrator it acts as.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\McpAccess;

defined( 'ABSPATH' ) || exit;

final class Tokens {

	public const OPTION = 'auvyx_mcp_tokens';

	/** Every scope, in the order the screen shows them. `read` is always granted. */
	public const SCOPES = array( 'read', 'draft', 'publish', 'code', 'delete' );

	/** Expiry choices, in days; the first one listed after 30 is the default. */
	public const EXPIRY  = array( 30, 90, 365 );
	public const DEFAULT = 90;

	/** At most this many tokens are kept (revoked ones included, the oldest revoked dropped first). */
	public const MAX = 50;

	private const PATTERN = '/^auvyxmcp_([a-f0-9]{8})_([a-f0-9]{40})$/';

	/**
	 * Stored tokens (never with a secret).
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function all(): array {
		$tokens = get_option( self::OPTION, array() );
		return is_array( $tokens ) ? array_values( array_filter( $tokens, 'is_array' ) ) : array();
	}

	/**
	 * @param array<int, array<string, mixed>> $tokens Tokens.
	 */
	private static function put( array $tokens ): void {
		update_option( self::OPTION, array_values( $tokens ), false );
	}

	public static function hash( string $secret ): string {
		return hash_hmac( 'sha256', $secret, wp_salt( 'auth' ) );
	}

	/**
	 * The scopes a user may hand to a token: never more than the user may do.
	 *
	 * @return string[]
	 */
	public static function grantable( int $user_id ): array {
		$out = array( 'read' );
		if ( user_can( $user_id, 'edit_pages' ) ) {
			$out[] = 'draft';
		}
		if ( user_can( $user_id, 'publish_pages' ) ) {
			$out[] = 'publish';
		}
		if ( user_can( $user_id, 'unfiltered_html' ) ) {
			$out[] = 'code';
		}
		if ( user_can( $user_id, 'delete_pages' ) ) {
			$out[] = 'delete';
		}
		return $out;
	}

	/**
	 * Makes a token. The answer holds the full token string once; only its hash is kept.
	 *
	 * @param string   $name    What the owner calls the connection.
	 * @param string[] $scopes  Asked scopes (cut to what the user may grant).
	 * @param int      $days    One of EXPIRY.
	 * @param int      $user_id The administrator it acts as.
	 * @return array{token: string, record: array<string, mixed>}|\WP_Error
	 */
	public static function create( string $name, array $scopes, int $days, int $user_id ) {
		$name = trim( sanitize_text_field( $name ) );
		if ( '' === $name ) {
			return new \WP_Error( 'auvyx_mcp_name', __( 'Give the connection a name.', 'auvyx-builder' ) );
		}
		if ( $user_id <= 0 || ! user_can( $user_id, 'manage_options' ) ) {
			return new \WP_Error( 'auvyx_mcp_user', __( 'Only an administrator makes AI connections.', 'auvyx-builder' ) );
		}
		$days   = in_array( $days, self::EXPIRY, true ) ? $days : self::DEFAULT;
		$scopes = array_values( array_intersect( self::SCOPES, array_merge( array( 'read' ), array_map( 'strval', $scopes ) ), self::grantable( $user_id ) ) );
		$tokens = self::all();
		$used   = array_column( $tokens, 'prefix' );
		do {
			$prefix = bin2hex( random_bytes( 4 ) );
		} while ( in_array( $prefix, $used, true ) );
		$secret   = bin2hex( random_bytes( 20 ) );
		$now      = time();
		$record   = array(
			'id'        => 'tok_' . bin2hex( random_bytes( 6 ) ),
			'name'      => mb_substr( $name, 0, 80 ),
			'user_id'   => $user_id,
			'hash'      => self::hash( $secret ),
			'prefix'    => $prefix,
			'scopes'    => $scopes,
			'created'   => $now,
			'expires'   => $now + $days * DAY_IN_SECONDS,
			'last_used' => 0,
			'revoked'   => 0,
		);
		$tokens[] = $record;
		$count    = count( $tokens );
		while ( $count > self::MAX ) {
			$drop = null;
			foreach ( $tokens as $i => $t ) {
				if ( ! empty( $t['revoked'] ) || (int) ( $t['expires'] ?? 0 ) < $now ) {
					$drop = $i;
					break;
				}
			}
			if ( null === $drop ) {
				return new \WP_Error( 'auvyx_mcp_full', __( 'Too many AI connections: revoke one first.', 'auvyx-builder' ) );
			}
			unset( $tokens[ $drop ] );
			--$count;
		}
		self::put( $tokens );
		return array(
			'token'  => 'auvyxmcp_' . $prefix . '_' . $secret,
			'record' => self::view( $record ),
		);
	}

	/**
	 * The stored token a presented one is, or why not. Constant-time comparison; the presented secret is never kept.
	 *
	 * @return array<string, mixed>|\WP_Error
	 */
	public static function verify( string $presented ) {
		$bad = new \WP_Error( 'auvyx_mcp_token', __( 'Unknown, expired or revoked Auvyx token.', 'auvyx-builder' ), array( 'status' => 401 ) );
		if ( ! preg_match( self::PATTERN, $presented, $m ) ) {
			return $bad;
		}
		$hash  = self::hash( $m[2] );
		$found = null;
		foreach ( self::all() as $t ) {
			if ( hash_equals( (string) ( $t['prefix'] ?? '' ), $m[1] ) && hash_equals( (string) ( $t['hash'] ?? '' ), $hash ) ) {
				$found = $t;
			}
		}
		if ( null === $found || ! empty( $found['revoked'] ) || (int) $found['expires'] < time() || ! get_userdata( (int) $found['user_id'] ) ) {
			return $bad;
		}
		return $found;
	}

	public static function revoke( string $id ): bool {
		$tokens = self::all();
		foreach ( $tokens as $i => $t ) {
			if ( ( $t['id'] ?? '' ) === $id && empty( $t['revoked'] ) ) {
				$tokens[ $i ]['revoked'] = time();
				self::put( $tokens );
				return true;
			}
		}
		return false;
	}

	/** Notes when a token was last used (at most once a minute: every request would otherwise write the option). */
	public static function touch( string $id ): void {
		$tokens = self::all();
		foreach ( $tokens as $i => $t ) {
			if ( ( $t['id'] ?? '' ) === $id ) {
				if ( time() - (int) $t['last_used'] >= MINUTE_IN_SECONDS ) {
					$tokens[ $i ]['last_used'] = time();
					self::put( $tokens );
				}
				return;
			}
		}
	}

	/**
	 * A token as shown (no hash).
	 *
	 * @param array<string, mixed> $t Stored token.
	 * @return array<string, mixed>
	 */
	public static function view( array $t ): array {
		unset( $t['hash'] );
		return $t;
	}
}
