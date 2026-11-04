<?php
/**
 * PHP port of packages/style-engine. Output MUST be byte-identical to the
 * TypeScript version; shared/fixtures/style-engine/cases.json runs on both.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\StyleEngine;

defined( 'ABSPATH' ) || exit;

final class StyleEngine {

	const STATES = array( 'default', 'hover', 'focus', 'active' );

	const STATE_PSEUDO = array(
		'default' => '',
		'hover'   => ':hover',
		'focus'   => ':focus-visible',
		'active'  => ':active',
	);

	const CUSTOM_PROPERTY = '/^--[a-z0-9-]+$/';
	const BREAKPOINT_ID   = '/^[a-z][a-z0-9-]*$/';
	const FORBIDDEN_VALUE = '/[;{}<>\\\\]|\/\*|\*\/|expression\(|javascript:|@import/i';
	const URL_CALL        = '/url\(/i';
	const URL_ARG         = '/url\([ \t\n\x0B\f\r]*([\'"]?)([^\'")]*)\1[ \t\n\x0B\f\r]*\)/i';
	const SAFE_URL        = '/^(https?:\/\/|\/)/i';
	const TRIM_CHARS      = " \t\n\r\0\x0B";
	const MAX_VALUE_LEN   = 500;

	/** @var array<string, true> */
	private $allowed;

	/**
	 * @param string[] $allowed_properties Allowlist from shared/css-properties.json.
	 */
	public function __construct( array $allowed_properties ) {
		$this->allowed = array_fill_keys( $allowed_properties, true );
	}

	public function is_allowed_property( string $property ): bool {
		return isset( $this->allowed[ $property ] ) || 1 === preg_match( self::CUSTOM_PROPERTY, $property );
	}

	public function is_safe_value( string $value ): bool {
		if ( '' === $value || strlen( $value ) > self::MAX_VALUE_LEN ) {
			return false;
		}
		if ( 1 === preg_match( self::FORBIDDEN_VALUE, $value ) ) {
			return false;
		}
		$url_args  = preg_match_all( self::URL_ARG, $value, $matches );
		$url_calls = preg_match_all( self::URL_CALL, $value );
		if ( $url_args !== $url_calls ) {
			return false;
		}
		foreach ( $matches[2] as $url ) {
			if ( 1 !== preg_match( self::SAFE_URL, trim( $url, self::TRIM_CHARS ) ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Drops anything unsafe or empty. Never throws.
	 *
	 * @param mixed $input Raw `auvyx.styles` attribute.
	 * @return array<string, array<string, array<string, string>>>
	 */
	public function normalize( $input ): array {
		$output = array();
		if ( ! self::is_record( $input ) ) {
			return $output;
		}
		foreach ( $input as $breakpoint_id => $states ) {
			if ( ! is_string( $breakpoint_id ) || 1 !== preg_match( self::BREAKPOINT_ID, $breakpoint_id ) || ! self::is_record( $states ) ) {
				continue;
			}
			$breakpoint_styles = array();
			foreach ( self::STATES as $state ) {
				if ( ! isset( $states[ $state ] ) || ! self::is_record( $states[ $state ] ) ) {
					continue;
				}
				$clean = array();
				foreach ( $states[ $state ] as $property => $raw ) {
					if ( ! is_string( $property ) || ( ! is_string( $raw ) && ! is_int( $raw ) ) ) {
						continue;
					}
					$value = trim( (string) $raw, self::TRIM_CHARS );
					if ( $this->is_allowed_property( $property ) && $this->is_safe_value( $value ) ) {
						$clean[ $property ] = $value;
					}
				}
				if ( array() !== $clean ) {
					$breakpoint_styles[ $state ] = $clean;
				}
			}
			if ( array() !== $breakpoint_styles ) {
				$output[ $breakpoint_id ] = $breakpoint_styles;
			}
		}
		return $output;
	}

	/**
	 * FNV-1a 32-bit over the UTF-8 bytes of the normalized JSON, base36.
	 *
	 * @param array<string, mixed> $styles Normalized styles.
	 */
	public function hash( array $styles ): string {
		$json   = (string) wp_json_encode(
			$styles,
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_INVALID_UTF8_SUBSTITUTE
		);
		$hash   = 0x811c9dc5;
		$length = strlen( $json );
		for ( $i = 0; $i < $length; $i++ ) {
			$hash ^= ord( $json[ $i ] );
			$hash  = ( $hash * 0x01000193 ) & 0xffffffff;
		}
		return base_convert( (string) $hash, 10, 36 );
	}

	/**
	 * Cascade order: base → max-width (wide to narrow) → min-width (narrow to wide).
	 * Stable on PHP 7.4 (usort is not).
	 *
	 * @param array<int, array<string, mixed>> $breakpoints Breakpoint config.
	 * @return array<int, array<string, mixed>>
	 */
	public static function sort_breakpoints( array $breakpoints ): array {
		$decorated = array();
		foreach ( array_values( $breakpoints ) as $index => $breakpoint ) {
			if ( isset( $breakpoint['minWidth'] ) ) {
				$rank = array( 2, (int) $breakpoint['minWidth'] );
			} elseif ( isset( $breakpoint['maxWidth'] ) ) {
				$rank = array( 1, - (int) $breakpoint['maxWidth'] );
			} else {
				$rank = array( 0, 0 );
			}
			$decorated[] = array( $rank[0], $rank[1], $index, $breakpoint );
		}
		usort(
			$decorated,
			static function ( $a, $b ) {
				return array( $a[0], $a[1], $a[2] ) <=> array( $b[0], $b[1], $b[2] );
			}
		);
		return array_column( $decorated, 3 );
	}

	/**
	 * @param array<string, mixed> $breakpoint Breakpoint config.
	 */
	public static function media_query( array $breakpoint ): string {
		$parts = array();
		if ( isset( $breakpoint['minWidth'] ) ) {
			$parts[] = '(min-width:' . (int) $breakpoint['minWidth'] . 'px)';
		}
		if ( isset( $breakpoint['maxWidth'] ) ) {
			$parts[] = '(max-width:' . (int) $breakpoint['maxWidth'] . 'px)';
		}
		return implode( ' and ', $parts );
	}

	/**
	 * @param array<string, array<string, array<string, string>>> $styles      Normalized styles.
	 * @param array<int, array<string, mixed>>                    $breakpoints Breakpoint config.
	 */
	public function compile( array $styles, string $selector, array $breakpoints ): string {
		$chunks = array();
		foreach ( self::sort_breakpoints( $breakpoints ) as $breakpoint ) {
			$id = isset( $breakpoint['id'] ) ? (string) $breakpoint['id'] : '';
			if ( ! isset( $styles[ $id ] ) ) {
				continue;
			}
			$rules = '';
			foreach ( self::STATES as $state ) {
				if ( empty( $styles[ $id ][ $state ] ) ) {
					continue;
				}
				$body = array();
				foreach ( $styles[ $id ][ $state ] as $property => $value ) {
					$body[] = $property . ':' . $value;
				}
				$rules .= $selector . self::STATE_PSEUDO[ $state ] . '{' . implode( ';', $body ) . '}';
			}
			if ( '' === $rules ) {
				continue;
			}
			$query    = self::media_query( $breakpoint );
			$chunks[] = '' === $query ? $rules : '@media ' . $query . '{' . $rules . '}';
		}
		return implode( '', $chunks );
	}

	/**
	 * @param mixed                            $input       Raw `auvyx.styles` attribute.
	 * @param array<int, array<string, mixed>> $breakpoints Breakpoint config.
	 * @return array{className: string, css: string}|null
	 */
	public function compile_block( $input, array $breakpoints ): ?array {
		$styles = $this->normalize( $input );
		if ( array() === $styles ) {
			return null;
		}
		$class_name = 'auvyx-' . $this->hash( $styles );
		$css        = $this->compile( $styles, '.' . $class_name, $breakpoints );
		return '' === $css ? null : array(
			'className' => $class_name,
			'css'       => $css,
		);
	}

	const SCOPED_MAX_BYTES = 20000;
	const SCOPED_COMMENT   = '#/\*.*?\*/#s';
	const SCOPED_FORBIDDEN = '/[<\\\\]|\/\*|\*\/|expression\(|javascript:|@import|@charset|@namespace|behavior:|-moz-binding/i';

	/**
	 * Scoped CSS (`auvyx.css`): free CSS for one element, `&` being the element, wrapped in the element's class with CSS
	 * nesting. Top-level @keyframes stay beside the wrapper. Refused whole when unsafe. Mirrors compileScopedCss().
	 *
	 * @param mixed $input Raw `auvyx.css` attribute.
	 * @return array{className: string, css: string}|null
	 */
	public function compile_scoped_css( $input ): ?array {
		if ( ! is_string( $input ) || strlen( $input ) > self::SCOPED_MAX_BYTES ) {
			return null;
		}
		$text = trim( (string) preg_replace( self::SCOPED_COMMENT, '', $input ), self::TRIM_CHARS );
		if ( '' === $text || 1 === preg_match( self::SCOPED_FORBIDDEN, $text ) || ! $this->urls_are_safe( $text ) ) {
			return null;
		}
		$items = self::top_level_items( $text );
		if ( null === $items ) {
			return null;
		}
		$keyframes = '';
		$body      = '';
		foreach ( $items as $item ) {
			$head = strtolower( substr( $item, 0, 19 ) );
			if ( 0 === strpos( $head, '@keyframes' ) || 0 === strpos( $head, '@-webkit-keyframes' ) ) {
				$keyframes .= $item;
			} else {
				$body .= $item;
			}
		}
		if ( '' === $keyframes && '' === $body ) {
			return null;
		}
		$source = $keyframes . "\n" . $body;
		$hash   = 0x811c9dc5;
		$length = strlen( $source );
		for ( $i = 0; $i < $length; $i++ ) {
			$hash ^= ord( $source[ $i ] );
			$hash  = ( $hash * 0x01000193 ) & 0xffffffff;
		}
		$class_name = 'auvyx-x' . base_convert( (string) $hash, 10, 36 );
		return array(
			'className' => $class_name,
			'css'       => $keyframes . ( '' === $body ? '' : '.' . $class_name . '{' . $body . '}' ),
		);
	}

	private function urls_are_safe( string $text ): bool {
		$url_args  = preg_match_all( self::URL_ARG, $text, $matches );
		$url_calls = preg_match_all( self::URL_CALL, $text );
		if ( $url_args !== $url_calls ) {
			return false;
		}
		foreach ( $matches[2] as $url ) {
			if ( 1 !== preg_match( self::SAFE_URL, trim( $url, self::TRIM_CHARS ) ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Top-level items: a declaration up to its `;`, a rule or at-rule up to the brace that closes it. Null when braces do not balance.
	 *
	 * @return string[]|null
	 */
	private static function top_level_items( string $text ): ?array {
		$items  = array();
		$depth  = 0;
		$start  = 0;
		$length = strlen( $text );
		for ( $i = 0; $i < $length; $i++ ) {
			$ch = $text[ $i ];
			if ( '{' === $ch ) {
				++$depth;
			} elseif ( '}' === $ch ) {
				--$depth;
				if ( $depth < 0 ) {
					return null;
				}
				if ( 0 === $depth ) {
					$items[] = substr( $text, $start, $i + 1 - $start );
					$start   = $i + 1;
				}
			} elseif ( ';' === $ch && 0 === $depth ) {
				$items[] = substr( $text, $start, $i + 1 - $start );
				$start   = $i + 1;
			}
		}
		if ( 0 !== $depth ) {
			return null;
		}
		$items[] = (string) substr( $text, $start );
		$out     = array();
		foreach ( $items as $item ) {
			$item = trim( $item, self::TRIM_CHARS );
			if ( '' !== $item ) {
				$out[] = $item;
			}
		}
		return $out;
	}

	/**
	 * JSON object (string-keyed array). Lists are rejected, mirroring the TS isRecord().
	 *
	 * @param mixed $value Value.
	 */
	private static function is_record( $value ): bool {
		if ( ! is_array( $value ) ) {
			return false;
		}
		return array() === $value || array_keys( $value ) !== range( 0, count( $value ) - 1 );
	}
}
