<?php
/**
 * Token mapping shared by the WordPress host: preset variables become the standard
 * `has-*` classes, and a classic theme's editor CSS can supply the colors and the font.
 *
 * No WordPress calls. ThemeAdapter reads the active theme and passes the pieces in.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\ThemeAdapter;

defined( 'ABSPATH' ) || exit;

final class ThemeTokens {

	const ISOLATED = 'auvyx-isolated';
	const SHADOW   = 'auvyx-shadow';

	/**
	 * Base/default declarations as WordPress utility classes. Any own text or background color gets
	 * `has-text-color` / `has-background` (as core does for a custom color), so blocks.css rules that
	 * skip `:not(.has-text-color)` leave it alone; only an exact preset variable adds `has-<slug>-*`.
	 *
	 * @param array<string, mixed> $decls CSS property → value.
	 * @return string[]
	 */
	public static function utility_classes( array $decls ): array {
		$classes = array();
		$map     = array(
			'color'            => array( 'has-text-color', 'has-%s-color' ),
			'background-color' => array( 'has-background', 'has-%s-background-color' ),
			'font-size'        => array( '', 'has-%s-font-size' ),
			'font-family'      => array( '', 'has-%s-font-family' ),
		);
		foreach ( $map as $property => $pair ) {
			$value = isset( $decls[ $property ] ) ? trim( (string) $decls[ $property ] ) : '';
			if ( '' !== $value && '' !== $pair[0] ) {
				$classes[] = $pair[0];
			}
			if ( 1 !== preg_match( '/^var\(--wp--preset--(?:color|font-size|font-family)--([a-z0-9-]+)\)$/', $value, $match ) ) {
				continue;
			}
			$classes[] = sprintf( $pair[1], $match[1] );
		}
		return $classes;
	}

	/**
	 * @param mixed $styles Raw `auvyx.styles`.
	 * @return array<string, string>
	 */
	public static function base_declarations( $styles ): array {
		if ( ! is_array( $styles ) || ! isset( $styles['base']['default'] ) || ! is_array( $styles['base']['default'] ) ) {
			return array();
		}
		$out = array();
		foreach ( $styles['base']['default'] as $property => $value ) {
			if ( is_string( $property ) && ( is_string( $value ) || is_numeric( $value ) ) ) {
				$out[ $property ] = (string) $value;
			}
		}
		return $out;
	}

	/**
	 * Colors and the font from a classic theme stylesheet (`body` / `html` rules only).
	 *
	 * @return array{color: string, background: string, fontFamily: string}
	 */
	public static function from_css( $css ): array {
		$css   = preg_replace( '!/\*.*?\*/!s', '', (string) $css );
		$found = array(
			'color'      => '',
			'background' => '',
			'fontFamily' => '',
		);
		if ( ! is_string( $css ) || ! preg_match( '/(?:^|})\\s*(?:body|html|body\\s*,\\s*html|html\\s*,\\s*body)\\s*\\{([^}]*)\\}/i', $css, $block ) ) {
			return $found;
		}
		$body = $block[1];
		if ( preg_match( '/(?:^|;)\\s*color\\s*:\\s*([^;]+)/i', $body, $color ) ) {
			$found['color'] = self::safe_color( $color[1] );
		}
		if ( preg_match( '/(?:^|;)\\s*background-color\\s*:\\s*([^;]+)/i', $body, $background ) || preg_match( '/(?:^|;)\\s*background\\s*:\\s*([^;]+)/i', $body, $background ) ) {
			$found['background'] = self::safe_color( $background[1] );
		}
		if ( preg_match( '/(?:^|;)\\s*font-family\\s*:\\s*([^;]+)/i', $body, $font ) ) {
			$found['fontFamily'] = self::safe_font( $font[1] );
		}
		return $found;
	}

	/**
	 * Isolated sections: a layer for Auvyx's own order, then the same reset unlayered so a theme's
	 * element rules do not win. A theme rule with !important still wins; Shadow mode is that case.
	 */
	public static function isolated_css(): string {
		$reset = '.auvyx-isolated.auvyx-isolated,.auvyx-isolated.auvyx-isolated :where(h1,h2,h3,h4,h5,h6,p,a,ul,ol,li,button,blockquote,figure){font-family:var(--wp--preset--font-family--auvyx-body);color:var(--wp--preset--color--auvyx-text);font-size:var(--wp--preset--font-size--auvyx-md);font-weight:400;line-height:1.5;letter-spacing:normal;background-color:transparent;margin-block:0}';
		return '@layer auvyx-reset, auvyx-blocks;@layer auvyx-reset{' . $reset . '}' . $reset;
	}

	/**
	 * A second copy of compiled block CSS, scoped under `.auvyx-isolated.auvyx-isolated`.
	 *
	 * The unlayered reset is (0, 2, 0), which beats a theme rule like `.theme h1` (0, 1, 1)
	 * and also a block class `.auvyx-hash` (0, 1, 0). The copy is (0, 3, 0), so a heading's own
	 * font-size and weight beat the reset, and the reset still beats the theme.
	 *
	 * @param string $css Compiled block CSS.
	 */
	public static function boost_isolated( $css ): string {
		return self::boost_under( $css, '.auvyx-isolated.auvyx-isolated' );
	}

	/**
	 * A second copy of compiled rules under `$prefix`, so a classic theme's element
	 * rule (`.single-content h1`, specificity 0,1,1) does not beat the block's own class.
	 *
	 * @param string $css    Compiled block CSS.
	 * @param string $prefix Selector prefix, with no trailing combinator.
	 */
	public static function boost_under( $css, $prefix ): string {
		$prefix = trim( (string) $prefix );
		if ( '' === $prefix || 1 !== preg_match( '/^[a-z0-9 :#.,>()\\[\\]="\'-]+$/i', $prefix ) ) {
			return '';
		}
		$items = self::split_rules( (string) $css );
		if ( null === $items ) {
			return '';
		}
		$out = '';
		foreach ( $items as $item ) {
			$out .= self::boost_item( $item, $prefix );
		}
		return $out;
	}

	/**
	 * The small runtime copied into a shadow tree. Buttons and links need nothing; a nav button
	 * toggles `is-open`, and a slider's next/prev buttons step `.auvyx-slide`.
	 */
	public static function runtime(): string {
		return '(function(){var root=document.currentScript&&document.currentScript.getRootNode();if(!root||!root.querySelectorAll)return;root.querySelectorAll("nav button").forEach(function(btn){btn.addEventListener("click",function(){var nav=btn.closest("nav");if(nav)nav.classList.toggle("is-open");});});root.querySelectorAll(".auvyx-slider").forEach(function(slider){var slides=slider.querySelectorAll(".auvyx-slide");var i=0;var show=function(){for(var n=0;n<slides.length;n++)slides[n].hidden=n!==i;};if(slides.length)show();slider.querySelectorAll("[data-auvyx-next]").forEach(function(b){b.addEventListener("click",function(){if(!slides.length)return;i=(i+1)%slides.length;show();});});slider.querySelectorAll("[data-auvyx-prev]").forEach(function(b){b.addEventListener("click",function(){if(!slides.length)return;i=(i-1+slides.length)%slides.length;show();});});});})();';
	}

	/**
	 * Declarative shadow root. Theme variables are copied onto :host the same way the sandboxed
	 * custom-code frame copies them, so the section themes without reading the parent document.
	 *
	 * @param string $inner        Already rendered, escaped block HTML.
	 * @param string $css          The section's own compiled CSS.
	 * @param string $tokens       `:host` custom properties (`--wp--preset--…`).
	 * @param bool   $interactive  Include the small runtime.
	 * @param string $mode         follow, isolated, or shadow.
	 */
	public static function shadow_html( $inner, $css, $tokens, $interactive, $mode ): string {
		$mode   = in_array( $mode, array( 'follow', 'isolated', 'shadow' ), true ) ? $mode : 'shadow';
		$reset  = 'follow' === $mode ? '' : '@layer auvyx-reset, auvyx-blocks;@layer auvyx-reset{:host,:host :where(*){font-family:var(--wp--preset--font-family--auvyx-body);color:var(--wp--preset--color--auvyx-text);font-size:var(--wp--preset--font-size--auvyx-md);font-weight:400;line-height:1.5;letter-spacing:normal}}@layer auvyx-blocks{';
		$close  = 'follow' === $mode ? '' : '}';
		$style  = self::seal( ':host{display:block;' . $tokens . '}' . $reset . $css . $close, 'style' );
		$script = $interactive ? '<script>' . self::seal( self::runtime(), 'script' ) . '</script>' : '';
		return '<auvyx-section data-auvyx-mode="' . $mode . '"><template shadowrootmode="open"><style>' . $style . '</style>' . $inner . $script . '</template></auvyx-section>';
	}

	/**
	 * @param string $text Source that must not close the surrounding tag.
	 * @param string $tag  style or script.
	 */
	public static function seal( $text, $tag ): string {
		return (string) preg_replace( '#</(' . $tag . ')#i', '<\\\\/$1', (string) $text );
	}

	/**
	 * @param string $value A CSS color from a stylesheet.
	 */
	private static function safe_color( $value ): string {
		$value = strtolower( trim( $value ) );
		if ( preg_match( '/^#[0-9a-f]{3,8}$/', $value ) ) {
			return $value;
		}
		if ( preg_match( '/^rgba?\([\d\s.,%]+\)$/', $value ) || preg_match( '/^hsla?\([\d\s.,%a-z]+\)$/', $value ) ) {
			return $value;
		}
		$named = array( 'black', 'white', 'currentcolor', 'transparent', 'canvas', 'canvastext' );
		return in_array( $value, $named, true ) ? $value : '';
	}

	/**
	 * @param string $value A font-family stack.
	 */
	/**
	 * @param string $item One top-level CSS rule.
	 */
	/**
	 * @param string $item   One top-level CSS rule.
	 * @param string $prefix Selector prefix.
	 */
	private static function boost_item( $item, $prefix ): string {
		$trim = ltrim( $item );
		$head = strtolower( substr( $trim, 0, 20 ) );
		if ( 0 === strpos( $head, '@keyframes' ) || 0 === strpos( $head, '@-webkit-keyframes' ) ) {
			return $item;
		}
		$open = strpos( $item, '{' );
		if ( false === $open ) {
			return $item;
		}
		if ( '@' === substr( $trim, 0, 1 ) ) {
			$inner = self::split_rules( substr( $item, $open + 1, -1 ) );
			if ( null === $inner ) {
				return $item;
			}
			$boosted = '';
			foreach ( $inner as $child ) {
				$boosted .= self::boost_item( $child, $prefix );
			}
			return substr( $item, 0, $open + 1 ) . $boosted . '}';
		}
		return self::prefix_selector( substr( $item, 0, $open ), $prefix ) . substr( $item, $open );
	}

	/**
	 * @param string $selector A selector list.
	 * @param string $prefix   Selector prefix.
	 */
	private static function prefix_selector( $selector, $prefix ): string {
		$selector = trim( (string) preg_replace( '/:root\b\s*/', '', $selector ) );
		if ( '' === $selector ) {
			return $prefix;
		}
		$parts = array();
		foreach ( explode( ',', $selector ) as $part ) {
			$part = trim( $part );
			if ( '' !== $part ) {
				$parts[] = $prefix . ' ' . $part;
			}
		}
		return implode( ',', $parts );
	}

	/**
	 * Top-level CSS rules. Null when braces do not balance.
	 *
	 * @param string $text CSS.
	 * @return string[]|null
	 */
	private static function split_rules( $text ): ?array {
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
		$out = array();
		foreach ( $items as $item ) {
			$item = trim( $item );
			if ( '' !== $item ) {
				$out[] = $item;
			}
		}
		return $out;
	}

	private static function safe_font( $value ): string {
		$value = trim( $value );
		if ( strlen( $value ) > 160 || preg_match( '/[{}<>;]|url\s*\(|expression\s*\(/i', $value ) ) {
			return '';
		}
		return preg_match( '/^[A-Za-z0-9 ,"\'._-]+$/', $value ) ? $value : '';
	}
}
