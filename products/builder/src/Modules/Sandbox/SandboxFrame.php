<?php
/**
 * The iframe a sandboxed custom-code block renders into. No WordPress calls: the same rules run in CLI tests.
 * The frame is an opaque origin (sandbox="allow-scripts" only). Its source is an attribute, so it cannot break
 * out into the page. Theme tokens are copied into the frame because an opaque frame does not inherit the page.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Sandbox;

defined( 'ABSPATH' ) || exit;

final class SandboxFrame {

	const MAX = 20000;

	/**
	 * @param array<string, mixed>                $sandbox html, css, js, allow.
	 * @param array<string, array<int, mixed>>    $tokens  Design-system token groups, when the host has them.
	 */
	public static function iframe( array $sandbox, array $tokens = array() ): string {
		$html  = self::clip( (string) ( $sandbox['html'] ?? '' ) );
		$css   = self::seal( self::clip( (string) ( $sandbox['css'] ?? '' ) ), 'style' );
		$js    = self::seal( self::clip( (string) ( $sandbox['js'] ?? '' ) ), 'script' );
		$allow = self::origins( $sandbox['allow'] ?? '' );
		$doc   = self::srcdoc( $html, $css, $js, $allow, self::theme_vars( $tokens ) );
		return '<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" data-auvyx-sandbox="1" style="width:100%;height:240px;border:0;display:block;pointer-events:none" srcdoc="' . self::escape( $doc ) . '"></iframe>';
	}

	/**
	 * @param mixed $raw A string or a list of origins.
	 * @return string[]
	 */
	public static function origins( $raw ): array {
		if ( is_array( $raw ) ) {
			$parts = $raw;
		} else {
			$parts = preg_split( '/[\s,]+/', (string) $raw );
		}
		$out = array();
		foreach ( (array) $parts as $origin ) {
			$origin = trim( (string) $origin );
			if ( '' !== $origin && self::origin_ok( $origin ) && ! in_array( $origin, $out, true ) && count( $out ) < 8 ) {
				$out[] = $origin;
			}
		}
		return $out;
	}

	/**
	 * @param string[] $allow https origins.
	 */
	public static function csp( array $allow ): string {
		$connect = array() === $allow ? "'none'" : implode( ' ', $allow );
		return "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src " . $connect . "; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
	}

	/**
	 * @param string[] $allow https origins.
	 */
	public static function srcdoc( string $html, string $css, string $js, array $allow, string $vars ): string {
		$policy = self::escape( self::csp( $allow ) );
		return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' . $policy . '"><style>:root{' . $vars . '}' . $css . '</style></head><body>' . $html . '<script>' . $js . '</script></body></html>';
	}

	/**
	 * @param array<string, array<int, mixed>> $tokens Token groups.
	 */
	public static function theme_vars( array $tokens ): string {
		$parts = array();
		self::vars_of( $parts, $tokens['color'] ?? array(), 'color', '--wp--preset--color--' );
		self::vars_of( $parts, $tokens['spacing'] ?? array(), 'size', '--wp--preset--spacing--' );
		self::vars_of( $parts, $tokens['fontSize'] ?? array(), 'size', '--wp--preset--font-size--' );
		self::vars_of( $parts, $tokens['radius'] ?? array(), 'size', '--wp--custom--radius--' );
		self::vars_of( $parts, $tokens['fontFamily'] ?? array(), 'size', '--wp--preset--font-family--' );
		return implode( ';', $parts );
	}

	/**
	 * @param string[]              $parts  Declarations.
	 * @param array<int, mixed>     $group  Token rows.
	 */
	private static function vars_of( array &$parts, array $group, string $value_key, string $prefix ): void {
		foreach ( $group as $token ) {
			if ( ! is_array( $token ) ) {
				continue;
			}
			$slug  = (string) ( $token['slug'] ?? '' );
			$value = (string) ( $token[ $value_key ] ?? '' );
			if ( preg_match( '/^[a-z0-9-]+$/', $slug ) && '' !== $value && ! preg_match( '/[;{}<>"\\\\]/', $value ) ) {
				$parts[] = $prefix . $slug . ':' . $value;
			}
		}
	}

	private static function origin_ok( string $origin ): bool {
		if ( false !== strpos( $origin, '..' ) || false !== strpos( $origin, '@' ) || false !== strpos( $origin, '\\' ) ) {
			return false;
		}
		$rest = substr( $origin, 8 );
		if ( false !== strpos( $rest, '/' ) ) {
			return false;
		}
		return 1 === preg_match( '/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{2,5})?$/', $origin )
			|| 1 === preg_match( '/^https:\/\/[a-z0-9](:[0-9]{2,5})?$/', $origin );
	}

	private static function clip( string $text ): string {
		return function_exists( 'mb_substr' ) ? mb_substr( $text, 0, self::MAX ) : substr( $text, 0, self::MAX );
	}

	private static function seal( string $text, string $tag ): string {
		return (string) preg_replace( '#</(' . $tag . ')#i', '<\\\\/$1', $text );
	}

	private static function escape( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
	}
}
