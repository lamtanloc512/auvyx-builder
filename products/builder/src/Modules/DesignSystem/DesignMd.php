<?php
/**
 * DESIGN.md (https://github.com/google-labs-code/design.md, version alpha) → Auvyx design preset (ADR 0031).
 * The YAML front matter carries the normative tokens: colors, typography levels, rounded, spacing, components, and from
 * Auvyx's design tool (packages/editor-core designSystem.ts) elevation (shadows), dark (the dark scheme) and concept.
 * They are read here (a small YAML subset: nested maps, scalars, lists — what the format uses), references like
 * `{colors.primary}` resolved, and mapped onto the roles the theme and Auvyx elements use. The markdown prose goes to
 * the AI as context.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\DesignSystem;

defined( 'ABSPATH' ) || exit;

final class DesignMd {

	/**
	 * Splits front matter tokens from the body.
	 *
	 * @param string $markdown DESIGN.md.
	 * @return array{tokens: array<string, mixed>, body: string}
	 */
	public static function split( string $markdown ): array {
		$markdown = str_replace( "\r\n", "\n", ltrim( $markdown, "\xEF\xBB\xBF" ) );
		if ( preg_match( '/^---\n(.*?)\n---\s*(\n|$)/s', $markdown, $m ) ) {
			return array(
				'tokens' => self::yaml( $m[1] ),
				'body'   => (string) substr( $markdown, strlen( $m[0] ) ),
			);
		}
		return array(
			'tokens' => array(),
			'body'   => $markdown,
		);
	}

	/**
	 * Minimal YAML: indentation maps, `key: value`, quoted or bare scalars, `- item` lists (scalars or `- key: v`
	 * maps), comments. Enough for DESIGN.md front matter; anything else is skipped, never executed.
	 *
	 * @param string $yaml YAML text.
	 * @return array<string, mixed>
	 */
	public static function yaml( string $yaml ): array {
		$root  = array();
		$stack = array( array( -1, &$root ) );
		foreach ( explode( "\n", $yaml ) as $line ) {
			if ( '' === trim( $line ) || 0 === strpos( ltrim( $line ), '#' ) ) {
				continue;
			}
			$indent = strlen( $line ) - strlen( ltrim( $line, ' ' ) );
			$text   = rtrim( self::strip_comment( ltrim( $line, ' ' ) ) );
			$top    = count( $stack ) - 1;
			while ( $top > 0 && $indent <= $stack[ $top ][0] ) {
				array_pop( $stack );
				--$top;
			}
			$parent = &$stack[ $top ][1];
			if ( 0 === strpos( $text, '- ' ) || '-' === $text ) {
				$item = trim( substr( $text, 1 ) );
				if ( preg_match( '/^([^:]+):\s*(.*)$/', $item, $kv ) && ! preg_match( '/^["\']/', $item ) ) {
					$parent[] = array( trim( $kv[1] ) => self::scalar( $kv[2] ) );
				} else {
					$parent[] = self::scalar( $item );
				}
				unset( $parent );
				continue;
			}
			if ( ! preg_match( '/^("[^"]*"|\'[^\']*\'|[^:]+):\s*(.*)$/', $text, $kv ) ) {
				unset( $parent );
				continue;
			}
			$key   = trim( $kv[1], " \"'" );
			$value = trim( $kv[2] );
			if ( '' === $value ) {
				$parent[ $key ] = array();
				$stack[]        = array( $indent, &$parent[ $key ] );
			} elseif ( '{' === $value[0] && '}' === substr( $value, -1 ) ) {
				$parent[ $key ] = self::flow( substr( $value, 1, -1 ) );
			} else {
				$parent[ $key ] = self::scalar( $value );
			}
			unset( $parent );
		}
		return $root;
	}

	/**
	 * An inline map (`{ sm: 4px, md: 8px }`, `{ fontFamily: Inter, fontSize: 48px }`), one level, commas inside quotes kept.
	 *
	 * @return array<string, mixed>
	 */
	private static function flow( string $inner ): array {
		$out   = array();
		$parts = array();
		$quote = '';
		$start = 0;
		$len   = strlen( $inner );
		for ( $i = 0; $i < $len; $i++ ) {
			$c = $inner[ $i ];
			if ( '' === $quote && ( '"' === $c || "'" === $c ) ) {
				$quote = $c;
			} elseif ( $c === $quote ) {
				$quote = '';
			} elseif ( '' === $quote && ',' === $c ) {
				$parts[] = substr( $inner, $start, $i - $start );
				$start   = $i + 1;
			}
		}
		$parts[] = substr( $inner, $start );
		foreach ( $parts as $part ) {
			if ( preg_match( '/^\s*("[^"]*"|\'[^\']*\'|[^:]+):\s*(.*)$/s', $part, $kv ) ) {
				$out[ trim( $kv[1], " \"'" ) ] = self::scalar( $kv[2] );
			}
		}
		return $out;
	}

	private static function strip_comment( string $text ): string {
		$quote = '';
		$len   = strlen( $text );
		for ( $i = 0; $i < $len; $i++ ) {
			$c = $text[ $i ];
			if ( '' === $quote && ( '"' === $c || "'" === $c ) ) {
				$quote = $c;
			} elseif ( $c === $quote ) {
				$quote = '';
			} elseif ( '' === $quote && '#' === $c && ( 0 === $i || ' ' === $text[ $i - 1 ] ) && ! preg_match( '/^#[0-9a-fA-F]{3,8}\b/', substr( $text, $i ) ) ) {
				return substr( $text, 0, $i );
			}
		}
		return $text;
	}

	/** @return string|int|float|bool */
	private static function scalar( string $value ) {
		$value = trim( $value );
		if ( preg_match( '/^"(.*)"$/s', $value, $m ) ) {
			return stripcslashes( $m[1] );
		}
		if ( preg_match( "/^'(.*)'$/s", $value, $m ) ) {
			return str_replace( "''", "'", $m[1] );
		}
		if ( in_array( strtolower( $value ), array( 'true', 'false' ), true ) ) {
			return 'true' === strtolower( $value );
		}
		return is_numeric( $value ) ? $value + 0 : $value;
	}

	// ---- tokens → preset ----------------------------------------------------------------------------

	/** `{colors.primary}` → its value (one level of nesting, up to 5 hops). */
	private static function resolve( array $tokens, $value ) {
		for ( $hop = 0; $hop < 5 && is_string( $value ) && preg_match( '/^\{([\w.-]+)\}$/', trim( $value ), $m ); $hop++ ) {
			$node = $tokens;
			foreach ( explode( '.', $m[1] ) as $part ) {
				$node = is_array( $node ) && array_key_exists( $part, $node ) ? $node[ $part ] : null;
			}
			$value = $node;
		}
		return $value;
	}

	/** Relative luminance of a hex color (null for other formats). */
	public static function luminance( string $hex ): ?float {
		$hex = ltrim( strtolower( trim( $hex ) ), '#' );
		if ( 3 === strlen( $hex ) ) {
			$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
		}
		if ( ! preg_match( '/^[0-9a-f]{6}/', $hex ) ) {
			return null;
		}
		$c = array();
		foreach ( array( 0, 2, 4 ) as $i ) {
			$v   = hexdec( substr( $hex, $i, 2 ) ) / 255;
			$c[] = $v <= 0.03928 ? $v / 12.92 : pow( ( $v + 0.055 ) / 1.055, 2.4 );
		}
		return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
	}

	public static function contrast( string $a, string $b ): float {
		$la = self::luminance( $a );
		$lb = self::luminance( $b );
		if ( null === $la || null === $lb ) {
			return 21.0;
		}
		return ( max( $la, $lb ) + 0.05 ) / ( min( $la, $lb ) + 0.05 );
	}

	/** Mix two hex colors (weight of $a in 0..1). */
	public static function mix( string $a, string $b, float $weight ): string {
		$pa = sscanf( ltrim( $a, '#' ), '%2x%2x%2x' );
		$pb = sscanf( ltrim( $b, '#' ), '%2x%2x%2x' );
		if ( ! is_array( $pa ) || ! is_array( $pb ) || in_array( null, $pa, true ) || in_array( null, $pb, true ) ) {
			return $a;
		}
		$out = '#';
		for ( $i = 0; $i < 3; $i++ ) {
			$out .= sprintf( '%02x', (int) round( $pa[ $i ] * $weight + $pb[ $i ] * ( 1 - $weight ) ) );
		}
		return $out;
	}

	private static function hex( $value ): string {
		$value = is_string( $value ) ? strtolower( trim( $value ) ) : '';
		if ( preg_match( '/^#([0-9a-f]{3}|[0-9a-f]{6})$/', $value ) ) {
			return $value;
		}
		if ( preg_match( '/^#([0-9a-f]{6})[0-9a-f]{2}$/', $value, $m ) ) {
			return '#' . $m[1]; // drop alpha for roles
		}
		return '';
	}

	/**
	 * Preset (Brief::sanitize schema) from DESIGN.md tokens.
	 *
	 * @param array<string, mixed> $tokens Front matter.
	 * @return array<string, mixed>
	 */
	public static function preset( array $tokens ): array {
		$colors     = is_array( $tokens['colors'] ?? null ) ? $tokens['colors'] : array();
		$pick       = static function ( array $keys ) use ( $colors, $tokens ): string {
			foreach ( $keys as $key ) {
				if ( isset( $colors[ $key ] ) ) {
					$hex = self::hex( self::resolve( $tokens, $colors[ $key ] ) );
					if ( '' !== $hex ) {
						return $hex;
					}
				}
			}
			return '';
		};
		$components = is_array( $tokens['components'] ?? null ) ? $tokens['components'] : array();
		$button     = is_array( $components['button-primary'] ?? null ) ? $components['button-primary'] : array();
		$hover      = is_array( $components['button-primary-hover'] ?? null ) ? $components['button-primary-hover'] : array();
		$comp       = static fn( array $c, string $k ) => self::resolve( $tokens, $c[ $k ] ?? null );

		$background = $pick( array( 'background', 'surface', 'neutral', 'surface-bright' ) );
		$background = '' !== $background ? $background : '#ffffff';
		$text       = $pick( array( 'on-background', 'on-surface', 'text', 'ink', 'foreground' ) );
		$primary    = $pick( array( 'primary' ) );
		// Simple palettes (primary / secondary / tertiary / neutral) often use a dark primary as the ink.
		if ( '' === $text ) {
			$text = '' !== $primary && self::contrast( $primary, $background ) >= 7 && ( self::luminance( $primary ) ?? 1 ) < 0.05 ? $primary : '#111111';
		}
		$action = self::hex( $comp( $button, 'backgroundColor' ) );
		if ( '' === $action ) {
			$action = '' !== $primary && $primary !== $text ? $primary : $pick( array( 'tertiary', 'secondary', 'accent' ) );
		}
		$action    = '' !== $action ? $action : $text;
		$on_action = self::hex( $comp( $button, 'textColor' ) );
		if ( '' === $on_action ) {
			$on_action = $pick( array( 'on-primary', 'onPrimary' ) );
		}
		if ( '' === $on_action || self::contrast( $on_action, $action ) < 3 ) {
			$on_action = self::contrast( '#ffffff', $action ) >= self::contrast( '#111111', $action ) ? '#ffffff' : '#111111';
		}
		$surface = $pick( array( 'surface-container-low', 'surface-container', 'surface-variant', 'surface' ) );
		$muted   = $pick( array( 'on-surface-variant', 'muted', 'text-secondary' ) );
		// Text on dark bands: the brief's own, else whatever reads on its secondary color (not the button text).
		$band    = $pick( array( 'secondary' ) );
		$on_band = $pick( array( 'on-secondary', 'inverse' ) );
		if ( '' !== $band && ( '' === $on_band || self::contrast( $on_band, $band ) < 4.5 ) ) {
			$on_band = self::contrast( '#ffffff', $band ) >= self::contrast( '#111111', $band ) ? '#ffffff' : '#111111';
		}
		$border = $pick( array( 'outline-variant', 'border', 'outline' ) );

		$out = array(
			'name'   => (string) ( $tokens['name'] ?? '' ),
			'colors' => array_filter(
				array(
					'primary'     => $action,
					'onPrimary'   => $on_action,
					'secondary'   => $band,
					'onSecondary' => $on_band,
					'accent'      => $pick( array( 'tertiary', 'accent' ) ),
					'background'  => $background,
					'surface'     => '' !== $surface && $surface !== $background ? $surface : self::mix( $text, $background, 0.04 ),
					'text'        => $text,
					'muted'       => '' !== $muted && self::contrast( $muted, $background ) >= 4.5 ? $muted : self::mix( $text, $background, 0.62 ),
					'border'      => '' !== $border ? $border : self::mix( $text, $background, 0.14 ),
					'sale'        => $pick( array( 'error', 'danger', 'sale' ) ),
				)
			),
		);

		// Typography levels → roles.
		$type  = is_array( $tokens['typography'] ?? null ) ? $tokens['typography'] : array();
		$level = static function ( array $names ) use ( $type ) {
			foreach ( $names as $name ) {
				if ( isset( $type[ $name ] ) && is_array( $type[ $name ] ) ) {
					return $type[ $name ];
				}
			}
			return null;
		};
		$roles = array(
			'display' => array( 'display', 'headline-display', 'display-lg', 'headline-xl', 'h1' ),
			'h1'      => array( 'h1', 'headline-xl', 'headline-lg', 'display' ),
			'h2'      => array( 'h2', 'headline-lg', 'headline-md' ),
			'h3'      => array( 'h3', 'headline-md', 'headline-sm', 'title-lg' ),
			'body'    => array( 'body-md', 'body', 'body-lg', 'paragraph' ),
			'small'   => array( 'body-sm', 'caption', 'label-md' ),
			'label'   => array( 'label-md', 'label', 'label-lg', 'button' ),
		);
		foreach ( $roles as $role => $names ) {
			$t = $level( $names );
			if ( $t ) {
				$out['type'][ $role ] = array_filter(
					array(
						'fontFamily'    => (string) ( $t['fontFamily'] ?? '' ),
						'fontSize'      => (string) ( $t['fontSize'] ?? '' ),
						'fontWeight'    => (string) ( $t['fontWeight'] ?? '' ),
						'lineHeight'    => (string) ( $t['lineHeight'] ?? '' ),
						'letterSpacing' => (string) ( $t['letterSpacing'] ?? '' ),
					),
					static fn( $v ) => '' !== $v
				);
			}
		}
		$heading = $out['type']['h1']['fontFamily'] ?? ( $out['type']['display']['fontFamily'] ?? '' );
		$body    = $out['type']['body']['fontFamily'] ?? '';
		if ( '' !== $heading ) {
			$out['fonts']['heading'] = $heading;
		}
		if ( '' !== $body ) {
			$out['fonts']['body'] = $body;
		}
		if ( isset( $out['type']['h1']['fontWeight'] ) ) {
			$out['headingWeight'] = $out['type']['h1']['fontWeight'];
		}

		// Shapes and spacing.
		$rounded = is_array( $tokens['rounded'] ?? null ) ? $tokens['rounded'] : array();
		foreach ( array(
			'sm' => array( 'sm', 'xs' ),
			'md' => array( 'md', 'DEFAULT', 'default' ),
			'lg' => array( 'lg', 'xl' ),
		) as $size => $names ) {
			foreach ( $names as $name ) {
				if ( isset( $rounded[ $name ] ) ) {
					$out['radii'][ $size ] = (string) self::resolve( $tokens, $rounded[ $name ] );
					break;
				}
			}
		}
		if ( isset( $out['radii']['md'] ) ) {
			$out['radius'] = $out['radii']['md'];
		}
		$spacing = is_array( $tokens['spacing'] ?? null ) ? $tokens['spacing'] : array();
		foreach ( array( 'xs', 'sm', 'md', 'lg', 'xl' ) as $size ) {
			if ( isset( $spacing[ $size ] ) ) {
				$out['spacing'][ $size ] = (string) self::resolve( $tokens, $spacing[ $size ] );
			}
		}

		// Buttons.
		$radius = $comp( $button, 'rounded' );
		if ( is_scalar( $radius ) && '' !== (string) $radius ) {
			$out['buttonRadius'] = (string) $radius;
		}
		$padding = $comp( $button, 'padding' );
		if ( is_scalar( $padding ) ) {
			$out['button']['padding'] = (string) $padding;
		}
		$label = $comp( $button, 'typography' );
		if ( is_array( $label ) ) {
			$out['button']['fontWeight']    = (string) ( $label['fontWeight'] ?? '' );
			$out['button']['letterSpacing'] = (string) ( $label['letterSpacing'] ?? '' );
			$out['button']['fontSize']      = (string) ( $label['fontSize'] ?? '' );
		}
		$out['button']['hoverBackground'] = self::hex( $comp( $hover, 'backgroundColor' ) );
		$out['button']['hoverText']       = self::hex( $comp( $hover, 'textColor' ) );
		// Inputs.
		$input                      = is_array( $components['input-field'] ?? null ) ? $components['input-field'] : array();
		$out['input']['background'] = self::hex( $comp( $input, 'backgroundColor' ) );
		$ir                         = $comp( $input, 'rounded' );
		$out['input']['radius']     = is_scalar( $ir ) ? (string) $ir : '';

		// Depth: `elevation` (the design tool's name; `shadows` read too) → shadow levels.
		$elevation = is_array( $tokens['elevation'] ?? null ) ? $tokens['elevation'] : ( is_array( $tokens['shadows'] ?? null ) ? $tokens['shadows'] : array() );
		foreach ( array( 'xs', 'sm', 'md', 'lg', 'xl' ) as $size ) {
			$shadow = self::resolve( $tokens, $elevation[ $size ] ?? null );
			if ( is_scalar( $shadow ) && '' !== (string) $shadow ) {
				$out['shadows'][ $size ] = (string) $shadow;
			}
		}

		// The dark scheme: the same role names as `colors`, read the same way (no fallbacks: the design tool derives
		// every role with its contrast, a brief without one gets no dark mode).
		$dark = is_array( $tokens['dark'] ?? null ) ? $tokens['dark'] : array();
		foreach ( array(
			'background' => array( 'background', 'surface' ),
			'surface'    => array( 'surface-container-low', 'surface-container', 'surface' ),
			'text'       => array( 'on-background', 'on-surface', 'text' ),
			'muted'      => array( 'on-surface-variant', 'muted' ),
			'border'     => array( 'outline-variant', 'border', 'outline' ),
			'primary'    => array( 'primary' ),
			'onPrimary'  => array( 'on-primary', 'onPrimary' ),
		) as $role => $names ) {
			foreach ( $names as $name ) {
				$hex = isset( $dark[ $name ] ) ? self::hex( self::resolve( $tokens, $dark[ $name ] ) ) : '';
				if ( '' !== $hex ) {
					$out['dark'][ $role ] = $hex;
					break;
				}
			}
		}

		// The concept the look was made for: kept with the preset for the next agent and the admin, never applied.
		if ( is_array( $tokens['concept'] ?? null ) ) {
			foreach ( array( 'idea', 'signature', 'palette', 'voice', 'habit' ) as $key ) {
				if ( isset( $tokens['concept'][ $key ] ) && is_scalar( $tokens['concept'][ $key ] ) ) {
					$out['concept'][ $key ] = (string) $tokens['concept'][ $key ];
				}
			}
		}
		return $out;
	}

	/** The font families a preset names, without generic families. */
	public static function families( array $preset ): array {
		$names = array();
		foreach ( (array) ( $preset['type'] ?? array() ) as $level ) {
			if ( ! empty( $level['fontFamily'] ) ) {
				$names[] = trim( explode( ',', (string) $level['fontFamily'] )[0], " \"'" );
			}
		}
		foreach ( (array) ( $preset['fonts'] ?? array() ) as $font ) {
			$names[] = trim( explode( ',', (string) $font )[0], " \"'" );
		}
		$generic = array( 'serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'inherit', '' );
		return array_values( array_unique( array_filter( $names, static fn( $n ) => ! in_array( strtolower( $n ), $generic, true ) ) ) );
	}
}
