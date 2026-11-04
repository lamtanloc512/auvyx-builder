<?php
/**
 * DESIGN.md → design preset (ADR 0031). A brand's design brief (markdown) is stored, turned into a preset — by the AI
 * when it is configured, else by reading the colors, fonts and radius written in the brief — and applied:
 * - Auvyx tokens (auvyx-primary …), so Auvyx elements and the AI use the brand;
 * - the theme layer of theme.json (palette, fonts, buttons, radius), so the theme and WooCommerce blocks follow it.
 * Global Styles edits by the user still win (user layer). Every AI request gets the brief as context.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\DesignSystem;

use Auvyx\Builder\Modules\Ai\Ai;

defined( 'ABSPATH' ) || exit;

final class Brief {

	const BRIEF  = 'auvyx_design_brief';
	const PRESET = 'auvyx_design_preset';

	/** The Auvyx color tokens from before the first preset, restored when the preset is removed. */
	const PREVIOUS = 'auvyx_design_preset_previous';

	/** Preset colors: key → [label, theme palette slug, Auvyx token slug]. */
	const COLORS = array(
		'primary'     => array( 'Primary', 'accent', 'auvyx-primary' ),
		'onPrimary'   => array( 'On primary', 'accent-contrast', 'auvyx-on-primary' ),
		'secondary'   => array( 'Secondary', '', 'auvyx-secondary' ),
		'onSecondary' => array( 'On secondary (text on dark bands)', '', 'auvyx-inverse' ),
		'accent'      => array( 'Accent', '', 'auvyx-accent' ),
		'background'  => array( 'Background', 'base', 'auvyx-base' ),
		'surface'     => array( 'Surface', 'surface', 'auvyx-surface' ),
		'text'        => array( 'Text', 'contrast', 'auvyx-text' ),
		'muted'       => array( 'Muted text', 'muted', 'auvyx-muted' ),
		'border'      => array( 'Border', 'border', 'auvyx-border' ),
		'sale'        => array( 'Sale / error', 'sale', '' ),
	);

	/** Shadow levels: `--wp--preset--shadow--auvyx-<size>` (Auvyx's), and the theme's own `<size>` slug when it has one. */
	const SHADOWS = array(
		'xs' => 'Extra small',
		'sm' => 'Small',
		'md' => 'Medium',
		'lg' => 'Large',
		'xl' => 'Extra large',
	);

	/** Spacing steps → the Auvyx spacing token (`--wp--preset--spacing--auvyx-<size>`). */
	const SPACING = array(
		'xs' => array( 'auvyx-xs', 'Auvyx XS' ),
		'sm' => array( 'auvyx-sm', 'Auvyx S' ),
		'md' => array( 'auvyx-md', 'Auvyx M' ),
		'lg' => array( 'auvyx-lg', 'Auvyx L' ),
		'xl' => array( 'auvyx-xl', 'Auvyx XL' ),
	);

	/** The colors a dark scheme sets (keys of COLORS). The others keep their light value. */
	const DARK = array( 'primary', 'onPrimary', 'background', 'surface', 'text', 'muted', 'border' );

	/** The concept's fields (the design tool's `concept:`), shown read-only and never applied. */
	const CONCEPT = array(
		'idea'      => 'Idea',
		'signature' => 'Signature',
		'palette'   => 'Palette',
		'voice'     => 'Voice',
		'habit'     => 'Habit',
	);

	public static function brief(): string {
		return (string) get_option( self::BRIEF, '' );
	}

	public static function save_brief( string $markdown ): void {
		update_option( self::BRIEF, mb_substr( wp_check_invalid_utf8( $markdown ), 0, 100000 ), false );
	}

	/**
	 * The applied preset, or an empty array.
	 *
	 * @return array<string, mixed>
	 */
	public static function preset(): array {
		$saved = get_option( self::PRESET, array() );
		return is_array( $saved ) ? self::sanitize( $saved ) : array();
	}

	// ---- validation -----------------------------------------------------------------------

	private static function color( $value ): string {
		$value = is_string( $value ) ? strtolower( trim( $value ) ) : '';
		if ( preg_match( '/^#([0-9a-f]{3}){1,2}$/', $value ) ) {
			return $value;
		}
		return preg_match( '/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/', $value ) ? $value : '';
	}

	/** A CSS font stack: family names, quotes, commas, spaces, hyphens. */
	private static function font( $value ): string {
		$value = is_string( $value ) ? trim( $value ) : '';
		return '' !== $value && strlen( $value ) <= 200 && preg_match( '/^[A-Za-z0-9 ,\'"\-]+$/', $value ) ? $value : '';
	}

	private static function length( $value, bool $negative = false ): string {
		$value = is_scalar( $value ) ? trim( (string) $value ) : '';
		if ( is_numeric( $value ) ) {
			$value .= 'px';
		}
		return preg_match( $negative ? '/^-?\d*\.?\d+(px|rem|em)$/' : '/^\d*\.?\d+(px|rem|em)$/', $value ) ? $value : '';
	}

	private static function weight( $value ): string {
		$value = is_scalar( $value ) ? (string) $value : '';
		return preg_match( '/^[1-9]00$/', $value ) ? $value : '';
	}

	/**
	 * A box-shadow: `none`, or offsets, blur, spread, `inset` and hex / rgb() / hsl() colors, comma-separated layers.
	 * Nothing that could leave the declaration (`;{}<>\`), load anything (`url(`) or run (`expression(`).
	 */
	private static function shadow( $value ): string {
		$value = is_string( $value ) ? strtolower( trim( preg_replace( '/\s+/', ' ', $value ) ) ) : '';
		if ( '' === $value || strlen( $value ) > 300 || preg_match( '/url\(|expression\(|var\(/', $value ) ) {
			return '';
		}
		return preg_match( '/^[a-z0-9 #.,()%\/+-]+$/', $value ) ? $value : '';
	}

	/** Line height: a unitless number or a length. */
	private static function line_height( $value ): string {
		$value = is_scalar( $value ) ? trim( (string) $value ) : '';
		return preg_match( '/^\d*\.?\d+$/', $value ) && (float) $value <= 4 ? $value : self::length( $value );
	}

	/**
	 * Keeps known keys with valid values only.
	 *
	 * @param array<string, mixed> $raw Preset from the AI, the rules or the option.
	 * @return array<string, mixed>
	 */
	public static function sanitize( array $raw ): array {
		$out = array( 'name' => sanitize_text_field( (string) ( $raw['name'] ?? '' ) ) );
		foreach ( array_keys( self::COLORS ) as $key ) {
			$color = self::color( $raw['colors'][ $key ] ?? '' );
			if ( '' !== $color ) {
				$out['colors'][ $key ] = $color;
			}
		}
		foreach ( array( 'heading', 'body' ) as $key ) {
			$font = self::font( $raw['fonts'][ $key ] ?? '' );
			if ( '' !== $font ) {
				$out['fonts'][ $key ] = $font;
			}
		}
		foreach ( array( 'radius', 'buttonRadius' ) as $key ) {
			$length = self::length( $raw[ $key ] ?? '' );
			if ( '' !== $length ) {
				$out[ $key ] = $length;
			}
		}
		if ( isset( $raw['headingWeight'] ) && in_array( (string) $raw['headingWeight'], array( '400', '500', '600', '700', '800', '900' ), true ) ) {
			$out['headingWeight'] = (string) $raw['headingWeight'];
		}
		// DESIGN.md levels (DesignMd::preset): display, h1–h3, body, small, label.
		foreach ( array( 'display', 'h1', 'h2', 'h3', 'body', 'small', 'label' ) as $role ) {
			$t     = is_array( $raw['type'][ $role ] ?? null ) ? $raw['type'][ $role ] : array();
			$level = array_filter(
				array(
					'fontFamily'    => self::font( $t['fontFamily'] ?? '' ),
					'fontSize'      => self::length( $t['fontSize'] ?? '' ),
					'fontWeight'    => self::weight( $t['fontWeight'] ?? '' ),
					'lineHeight'    => self::line_height( $t['lineHeight'] ?? '' ),
					'letterSpacing' => self::length( $t['letterSpacing'] ?? '', true ),
				)
			);
			if ( $level ) {
				$out['type'][ $role ] = $level;
			}
		}
		foreach ( array( 'sm', 'md', 'lg' ) as $size ) {
			$r = self::length( $raw['radii'][ $size ] ?? '' );
			if ( '' !== $r ) {
				$out['radii'][ $size ] = $r;
			}
		}
		foreach ( array( 'xs', 'sm', 'md', 'lg', 'xl' ) as $size ) {
			$s = self::length( $raw['spacing'][ $size ] ?? '' );
			if ( '' !== $s ) {
				$out['spacing'][ $size ] = $s;
			}
		}
		$button = array_filter(
			array(
				'padding'         => self::length( $raw['button']['padding'] ?? '' ),
				'fontWeight'      => self::weight( $raw['button']['fontWeight'] ?? '' ),
				'fontSize'        => self::length( $raw['button']['fontSize'] ?? '' ),
				'letterSpacing'   => self::length( $raw['button']['letterSpacing'] ?? '', true ),
				'hoverBackground' => self::color( $raw['button']['hoverBackground'] ?? '' ),
				'hoverText'       => self::color( $raw['button']['hoverText'] ?? '' ),
			)
		);
		if ( $button ) {
			$out['button'] = $button;
		}
		$input = array_filter(
			array(
				'background' => self::color( $raw['input']['background'] ?? '' ),
				'radius'     => self::length( $raw['input']['radius'] ?? '' ),
			)
		);
		if ( $input ) {
			$out['input'] = $input;
		}
		foreach ( array_keys( self::SHADOWS ) as $size ) {
			$shadow = self::shadow( $raw['shadows'][ $size ] ?? '' );
			if ( '' !== $shadow ) {
				$out['shadows'][ $size ] = $shadow;
			}
		}
		foreach ( self::DARK as $key ) {
			$color = self::color( $raw['dark'][ $key ] ?? '' );
			if ( '' !== $color ) {
				$out['dark'][ $key ] = $color;
			}
		}
		foreach ( array_keys( self::CONCEPT ) as $key ) {
			$text = is_scalar( $raw['concept'][ $key ] ?? null ) ? sanitize_text_field( mb_substr( (string) $raw['concept'][ $key ], 0, 500 ) ) : '';
			if ( '' !== $text ) {
				$out['concept'][ $key ] = $text;
			}
		}
		return isset( $out['colors'] ) || isset( $out['fonts'] ) || isset( $out['radius'] ) || isset( $out['type'] ) ? $out : array();
	}

	// ---- generation -----------------------------------------------------------------------

	/**
	 * Reads `primary: #2563eb`, `Heading font: Inter`, `radius: 8px`-style lines (any markdown around them).
	 *
	 * @param string $markdown Brief.
	 * @return array<string, mixed>
	 */
	/**
	 * Preset from a brief: DESIGN.md tokens (front matter) when present — exact —, else the lines of the prose.
	 *
	 * @param string $markdown Brief.
	 * @return array<string, mixed>
	 */
	public static function from_brief( string $markdown ): array {
		$split = DesignMd::split( $markdown );
		if ( $split['tokens'] ) {
			$preset = self::sanitize( DesignMd::preset( $split['tokens'] ) );
			if ( $preset ) {
				return $preset;
			}
		}
		return self::from_rules( $markdown );
	}

	public static function from_rules( string $markdown ): array {
		// Most specific first: "primary text" is onPrimary, "secondary text" is muted.
		$aliases = array(
			'onPrimary'  => 'on[ -]?primary|primary[ -]text|on[ -]brand',
			'muted'      => 'muted|subtle|secondary[ -]text',
			'primary'    => 'primary|brand|main',
			'secondary'  => 'secondary',
			'accent'     => 'accent|highlight',
			'background' => 'background|bg|page',
			'surface'    => 'surface|card|panel',
			'text'       => 'text|foreground|ink|body[ -]text',
			'border'     => 'border|divider|line',
			'sale'       => 'sale|error|danger|destructive',
		);

		$raw = array( 'name' => preg_match( '/^#\s+(.+)$/m', $markdown, $m ) ? trim( $m[1] ) : '' );
		foreach ( preg_split( '/\R/', $markdown ) as $line ) {
			$clean = strtolower( trim( preg_replace( '/[*_`>|]/', ' ', $line ) ) );
			if ( preg_match( '/(#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\))/i', $line, $hex ) ) {
				foreach ( $aliases as $key => $pattern ) {
					if ( ! isset( $raw['colors'][ $key ] ) && preg_match( '/^[-\s]*(' . $pattern . ')\b[^#:]*[:=\s]/', $clean ) ) {
						$raw['colors'][ $key ] = $hex[1];
						break;
					}
				}
			}
			if ( preg_match( '/^[-\s]*(heading|display|title)s?[ -]?(font|typeface|family)?\s*[:=]\s*(.+)$/i', trim( preg_replace( '/[*_`]/', '', $line ) ), $f ) ) {
				$raw['fonts']['heading'] = trim( $f[3], " .\t" );
			}
			if ( preg_match( '/^[-\s]*(body|text|base)[ -]?(font|typeface|family)\s*[:=]\s*(.+)$/i', trim( preg_replace( '/[*_`]/', '', $line ) ), $f ) ) {
				$raw['fonts']['body'] = trim( $f[3], " .\t" );
			}
			if ( preg_match( '/^[-\s]*(border[ -])?radius\s*[:=]\s*(\d+(\.\d+)?(px|rem)?)/i', trim( preg_replace( '/[*_`]/', '', $line ) ), $r ) ) {
				$raw['radius'] = $r[2];
			}
			if ( preg_match( '/^[-\s]*button[ -]radius\s*[:=]\s*(\d+(\.\d+)?(px|rem)?)/i', trim( preg_replace( '/[*_`]/', '', $line ) ), $r ) ) {
				$raw['buttonRadius'] = $r[1];
			}
		}
		foreach ( array( 'heading', 'body' ) as $key ) {
			if ( isset( $raw['fonts'][ $key ] ) ) {
				$raw['fonts'][ $key ] = self::stack( $raw['fonts'][ $key ] );
			}
		}
		return self::sanitize( $raw );
	}

	/** "Inter" → "Inter, system-ui, sans-serif"; serif names get a serif fallback. */
	private static function stack( string $family ): string {
		$family = trim( preg_replace( '/\(.*?\)/', '', $family ) );
		if ( false !== strpos( $family, ',' ) ) {
			return $family;
		}
		$quoted = preg_match( '/\s/', $family ) ? '"' . $family . '"' : $family;
		$serif  = preg_match( '/serif|garamond|georgia|times|playfair|merriweather|lora|baskerville|fraunces|crimson|cormorant|bodoni|didot/i', $family ) && ! preg_match( '/sans/i', $family );
		return $quoted . ( $serif ? ', Georgia, serif' : ', system-ui, sans-serif' );
	}

	/**
	 * Asks the configured AI for a preset following the brief.
	 *
	 * @param string $markdown Brief.
	 * @return array<string, mixed>|\WP_Error
	 */
	public static function from_ai( string $markdown ) {
		if ( ! Ai::configured() ) {
			return new \WP_Error( 'auvyx_ai_not_configured', __( 'The AI assistant is not configured.', 'auvyx-builder' ) );
		}
		$system = 'You turn a brand design brief (DESIGN.md) into a website design preset. Answer with JSON only, no prose, '
			. 'matching: {"name": string, "colors": {"primary","onPrimary","secondary","accent","background","surface","text","muted","border","sale"} '
			. '(hex colors), "fonts": {"heading","body"} (CSS font stacks with a generic fallback), "radius": "8px", '
			. '"buttonRadius": "6px", "headingWeight": "700"}. Use the colors and fonts the brief names; infer the rest so text '
			. 'on background and onPrimary on primary reach WCAG AA contrast.';
		$result = Ai::complete(
			$system,
			array(
				array(
					'role'    => 'user',
					'content' => mb_substr( $markdown, 0, 60000 ),
				),
			)
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$json = preg_match( '/\{[\s\S]*\}/', (string) $result['content'], $m ) ? json_decode( $m[0], true ) : null;
		$out  = is_array( $json ) ? self::sanitize( $json ) : array();
		return array() === $out ? new \WP_Error( 'auvyx_preset_invalid', __( 'The AI answer was not a usable preset.', 'auvyx-builder' ) ) : $out;
	}

	// ---- applying -------------------------------------------------------------------------

	/**
	 * Saves the preset and writes it into the Auvyx tokens: colors (same slugs, other tokens untouched), spacing
	 * (auvyx-xs … auvyx-xl) and shadows (auvyx-sm … : `settings.shadow.presets`), so pickers, the agent and its audit see them.
	 *
	 * @param array<string, mixed> $preset Preset.
	 * @return string[] Problems (fonts that could not be installed); the preset is applied anyway.
	 */
	public static function apply( array $preset ): array {
		$preset  = self::sanitize( $preset );
		$weights = array();
		foreach ( (array) ( $preset['type'] ?? array() ) as $level ) {
			if ( ! empty( $level['fontWeight'] ) ) {
				$weights[] = (string) $level['fontWeight'];
			}
		}
		$errors = Fonts::install( DesignMd::families( $preset ), $weights ? $weights : array( '400', '700' ) );
		update_option( self::PRESET, $preset, false );
		$saved  = get_option( DesignSystem::OPTION, array() );
		$saved  = is_array( $saved ) ? $saved : array();
		$own    = static function ( string $type ) use ( $saved ): array {
			return isset( $saved['tokens'][ $type ] ) && is_array( $saved['tokens'][ $type ] ) ? $saved['tokens'][ $type ] : array();
		};
		$colors = $own( 'color' );
		// Only the first preset records them: applying another one must not make the first preset "the original". A record
		// from before spacing and shadows were applied gets them now (no preset had changed them yet).
		$previous = get_option( self::PREVIOUS );
		$previous = is_array( $previous ) ? $previous : array( 'colors' => $colors );
		foreach ( array( 'spacing', 'shadow' ) as $type ) {
			if ( ! array_key_exists( $type, $previous ) ) {
				$previous[ $type ] = $own( $type );
			}
		}
		update_option( self::PREVIOUS, $previous, false );

		$by = array_column( $colors, null, 'slug' );
		foreach ( self::COLORS as $key => $map ) {
			if ( '' !== $map[2] && isset( $preset['colors'][ $key ] ) ) {
				$by[ $map[2] ] = array(
					'slug'  => $map[2],
					'name'  => 'Auvyx ' . $map[0],
					'color' => $preset['colors'][ $key ],
				);
			}
		}
		$changed = false;
		if ( $by ) {
			$saved['tokens']['color'] = array_values( $by );
			$changed                  = true;
		}
		// Spacing and shadows start from the tokens before any preset: a preset without them gives the originals back.
		$spacing = array_column( (array) $previous['spacing'], null, 'slug' );
		foreach ( self::SPACING as $size => $map ) {
			if ( isset( $preset['spacing'][ $size ] ) ) {
				$spacing[ $map[0] ] = array(
					'slug' => $map[0],
					'name' => $map[1],
					'size' => $preset['spacing'][ $size ],
				);
			}
		}
		$shadows = array_column( (array) $previous['shadow'], null, 'slug' );
		foreach ( self::SHADOWS as $size => $label ) {
			if ( isset( $preset['shadows'][ $size ] ) ) {
				$shadows[ 'auvyx-' . $size ] = array(
					'slug'   => 'auvyx-' . $size,
					'name'   => 'Auvyx ' . $label,
					'shadow' => $preset['shadows'][ $size ],
				);
			}
		}
		foreach ( array(
			'spacing' => $spacing,
			'shadow'  => $shadows,
		) as $type => $list ) {
			if ( $list ) {
				$saved['tokens'][ $type ] = array_values( $list );
				$changed                  = true;
			} elseif ( isset( $saved['tokens'][ $type ] ) ) {
				unset( $saved['tokens'][ $type ] );
				$changed = true;
			}
		}
		if ( $changed ) {
			update_option( DesignSystem::OPTION, $saved );
		}
		self::flush();
		return $errors;
	}

	public static function clear(): void {
		delete_option( self::PRESET );
		// The preset changed the Auvyx tokens too: give them back their colors, spacing and shadows from before it.
		$previous = get_option( self::PREVIOUS );
		if ( is_array( $previous ) ) {
			$saved = get_option( DesignSystem::OPTION, array() );
			$saved = is_array( $saved ) ? $saved : array();
			foreach ( array(
				'colors'  => 'color',
				'spacing' => 'spacing',
				'shadow'  => 'shadow',
			) as $key => $type ) {
				if ( ! array_key_exists( $key, $previous ) ) {
					continue;
				}
				if ( empty( $previous[ $key ] ) ) {
					unset( $saved['tokens'][ $type ] );
				} else {
					$saved['tokens'][ $type ] = $previous[ $key ];
				}
			}
			if ( isset( $saved['tokens'] ) && array() === $saved['tokens'] ) {
				unset( $saved['tokens'] );
			}
			update_option( DesignSystem::OPTION, $saved );
			delete_option( self::PREVIOUS );
		}
		self::flush();
	}

	/** Theme JSON is cached per request and in the object cache. */
	private static function flush(): void {
		if ( function_exists( 'wp_clean_theme_json_cache' ) ) {
			wp_clean_theme_json_cache();
		}
	}

	/** Classic themes (Kadence, Astra…) often paint their own page background over theme.json. */
	public static function print_surface(): void {
		if ( is_admin() ) {
			return;
		}
		$css = self::surface_css();
		if ( '' === $css ) {
			return;
		}
		// CSS from the brief's sanitized tokens; tags stripped so nothing can close the style element. HTML escaping
		// would break CSS (quotes, >), so it is not used here.
		echo '<style id="auvyx-preset-surface">' . wp_strip_all_tags( $css ) . "</style>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Preset surface for the whole front: page background, and the classic-theme chrome that
	 * would otherwise stay on the theme's own colors (header, content box, footer).
	 */
	public static function surface_css(): string {
		$preset = self::preset();
		if ( array() === $preset ) {
			return '';
		}
		$bg   = self::color( $preset['colors']['background'] ?? '' );
		$text = self::color( $preset['colors']['text'] ?? '' );
		if ( '' === $bg && '' === $text ) {
			return '';
		}
		$design = \Auvyx\Builder\Plugin::instance()->module( 'design-system' );
		$vars   = $design instanceof DesignSystem ? $design->color_variable_css() . $design->color_utility_css() : '';
		$css    = '' !== $vars ? wp_strip_all_tags( $vars ) : '';
		return $css . self::chrome_css( $bg, $text, '' ) . self::dark_css( $preset );
	}

	/** Page and classic-theme chrome (header, content box, footer) in a background and a text color, under a scope. */
	private static function chrome_css( string $bg, string $text, string $scope ): string {
		$in  = static function ( string $selectors ) use ( $scope ): string {
			return '' === $scope ? $selectors : $scope . ' ' . str_replace( ',', ',' . $scope . ' ', $selectors );
		};
		$css = '';
		if ( '' !== $bg ) {
			$css .= $in( 'body' ) . '{background-color:' . esc_attr( $bg ) . '!important;}';
			// Kadence paints `.content-bg` white and the header white, over a dark preset.
			$css .= $in( 'article.content-bg,.content-bg,.entry-content-wrap' ) . '{background-color:' . esc_attr( $bg ) . '!important;}';
			$css .= $in( '#masthead,.site-header,.site-header-wrap,.site-main-header-wrap,.site-top-header-wrap,.site-bottom-header-wrap,.site-mobile-header-wrap,.mobile-header,.main-header-bar,.ast-primary-header-bar,.site-footer,.footer-widget-area,.site-info,.footer-html' ) . '{background-color:' . esc_attr( $bg ) . '!important;}';
		}
		if ( '' !== $text ) {
			$css .= $in( 'body' ) . '{color:' . esc_attr( $text ) . '!important;}';
			$css .= $in( '#masthead .site-title,#masthead .brand,#masthead a,.site-header .site-title,.site-header a,.site-mobile-header-wrap .site-title,.site-mobile-header-wrap a,.main-header-bar a,.ast-primary-header-bar a,.site-footer,.site-footer a,.footer-widget-area,.footer-widget-area a,.site-info,.site-info a,.footer-html,.footer-html a' ) . '{color:' . esc_attr( $text ) . '!important;}';
		}
		return $css;
	}

	/**
	 * The brief's dark scheme as a real dark mode: the color presets (the theme's roles and the Auvyx tokens) take their dark
	 * values when the visitor's system is dark (`prefers-color-scheme`), unless the page says `data-theme="light"` on
	 * <html>; `data-theme="dark"` turns it on whatever the system (a site's own toggle sets that attribute). The page,
	 * classic-theme chrome and buttons, which theme.json paints with literal colors, follow. Light values stay as they are.
	 *
	 * @param array<string, mixed> $preset Sanitized preset.
	 */
	public static function dark_css( array $preset ): string {
		$dark = array();
		foreach ( self::DARK as $key ) {
			$color = self::color( $preset['dark'][ $key ] ?? '' );
			if ( '' !== $color ) {
				$dark[ $key ] = $color;
			}
		}
		if ( ! isset( $dark['background'], $dark['text'] ) ) {
			return ''; // Without a ground and its text there is no dark mode to give.
		}
		$vars = array( 'color-scheme:dark' );
		foreach ( $dark as $key => $color ) {
			foreach ( array( self::COLORS[ $key ][1], self::COLORS[ $key ][2] ) as $slug ) {
				if ( '' !== $slug ) {
					$vars[] = '--wp--preset--color--' . $slug . ':' . esc_attr( $color );
				}
			}
		}
		$rules = static function ( string $scope ) use ( $dark, $vars ): string {
			$css = $scope . '{' . implode( ';', $vars ) . ';}' . self::chrome_css( $dark['background'], $dark['text'], $scope );
			if ( isset( $dark['primary'] ) ) {
				$css .= $scope . ' .wp-element-button,' . $scope . ' .wp-block-button__link{background-color:' . esc_attr( $dark['primary'] ) . ';color:' . esc_attr( $dark['onPrimary'] ?? $dark['background'] ) . ';}';
				$css .= $scope . ' .wp-element-button:hover,' . $scope . ' .wp-block-button__link:hover{background-color:' . esc_attr( $dark['text'] ) . ';color:' . esc_attr( $dark['background'] ) . ';}';
			}
			return $css;
		};
		return '@media (prefers-color-scheme: dark){' . $rules( ':root:not([data-theme="light"])' ) . '}' . $rules( ':root[data-theme="dark"]' );
	}

	/**
	 * What the admin shows of a preset beyond its colors and type: the concept it was made for (read-only), the dark
	 * scheme and the shadow levels. Escaped here.
	 *
	 * @param array<string, mixed> $preset Preset.
	 */
	public static function details_html( array $preset ): string {
		$html = '';
		if ( ! empty( $preset['concept'] ) && is_array( $preset['concept'] ) ) {
			$html .= '<h4>' . esc_html__( 'Concept', 'auvyx-builder' ) . '</h4><dl class="auvyx-dl auvyx-brief-concept">';
			foreach ( self::CONCEPT as $key => $label ) {
				if ( isset( $preset['concept'][ $key ] ) ) {
					$html .= '<dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( (string) $preset['concept'][ $key ] ) . '</dd>';
				}
			}
			$html .= '</dl>';
		}
		if ( ! empty( $preset['dark'] ) && is_array( $preset['dark'] ) ) {
			$html .= '<h4>' . esc_html__( 'Dark mode', 'auvyx-builder' ) . '</h4><div class="auvyx-swatches">';
			foreach ( $preset['dark'] as $key => $color ) {
				$html .= sprintf(
					'<div class="auvyx-swatch"><span class="auvyx-swatch__chip" style="background:%1$s"></span><strong>%2$s</strong><code>%1$s</code></div>',
					esc_attr( (string) $color ),
					esc_html( self::COLORS[ $key ][0] ?? (string) $key )
				);
			}
			$html .= '</div>';
		}
		if ( ! empty( $preset['shadows'] ) && is_array( $preset['shadows'] ) ) {
			$html .= '<h4>' . esc_html__( 'Shadows', 'auvyx-builder' ) . '</h4><dl class="auvyx-dl">';
			foreach ( $preset['shadows'] as $size => $shadow ) {
				$html .= '<dt><code>--wp--preset--shadow--auvyx-' . esc_html( (string) $size ) . '</code></dt><dd><code>' . esc_html( (string) $shadow ) . '</code></dd>';
			}
			$html .= '</dl>';
		}
		return $html;
	}

	/**
	 * Theme layer: palette values for the theme's slugs, fonts, heading weight, button and element radius.
	 *
	 * @param \WP_Theme_JSON_Data $theme_json Theme layer.
	 * @return \WP_Theme_JSON_Data
	 */
	public static function inject( $theme_json ) {
		$preset = self::preset();
		if ( array() === $preset ) {
			return $theme_json;
		}
		$data    = $theme_json->get_data();
		$palette = $data['settings']['color']['palette'] ?? array();
		$palette = is_array( $palette ) && isset( $palette['theme'] ) ? $palette['theme'] : ( is_array( $palette ) ? $palette : array() );
		$by      = array_column( array_filter( $palette, 'is_array' ), null, 'slug' );
		foreach ( self::COLORS as $key => $map ) {
			if ( '' !== $map[1] && isset( $preset['colors'][ $key ] ) ) {
				$by[ $map[1] ] = array(
					'slug'  => $map[1],
					'name'  => $by[ $map[1] ]['name'] ?? $map[0],
					'color' => $preset['colors'][ $key ],
				);
			}
		}
		$update = array(
			'version'  => 3,
			'settings' => array( 'color' => array( 'palette' => array_values( $by ) ) ),
			'styles'   => array(),
		);
		if ( isset( $preset['colors']['background'] ) ) {
			$update['styles']['color']['background'] = $preset['colors']['background'];
		}
		if ( isset( $preset['colors']['text'] ) ) {
			$update['styles']['color']['text'] = $preset['colors']['text'];
		}
		if ( isset( $preset['fonts']['body'] ) ) {
			$update['styles']['typography']['fontFamily'] = $preset['fonts']['body'];
		}
		if ( isset( $preset['fonts']['heading'] ) ) {
			$update['styles']['elements']['heading']['typography']['fontFamily'] = $preset['fonts']['heading'];
		}
		if ( isset( $preset['headingWeight'] ) ) {
			$update['styles']['elements']['heading']['typography']['fontWeight'] = $preset['headingWeight'];
		}
		$button = $preset['buttonRadius'] ?? ( $preset['radius'] ?? '' );
		if ( '' !== $button ) {
			$update['styles']['elements']['button']['border']['radius'] = $button;
			// The theme draws rounded buttons as squircles; a pill stays a pill (--wp--custom--button--corner).
			$update['settings']['custom']['button']['corner'] = \Auvyx\Builder\Modules\Styles\Styles::smooth_corner( (string) $button ) ? 'squircle' : 'round';
		}
		// Buttons in the brand color (Woo's add to cart, checkout and the theme's buttons use the button element).
		if ( isset( $preset['colors']['primary'] ) ) {
			$update['styles']['elements']['button']['color']['background'] = $preset['colors']['primary'];
			$update['styles']['elements']['button']['color']['text']       = $preset['colors']['onPrimary'] ?? '#ffffff';
			if ( isset( $preset['colors']['text'] ) ) {
				$update['styles']['elements']['button'][':hover']['color']['background'] = $preset['colors']['text'];
				$update['styles']['elements']['button'][':hover']['color']['text']       = $preset['colors']['background'] ?? '#ffffff';
			}
		}
		// Installed fonts join the theme's families; the preset's fonts point at them.
		$families = $data['settings']['typography']['fontFamilies'] ?? array();
		$families = is_array( $families ) && isset( $families['theme'] ) ? $families['theme'] : ( is_array( $families ) ? $families : array() );
		foreach ( Fonts::installed() as $font ) {
			$families[] = $font;
		}
		// Auvyx's heading and body families follow the preset's fonts once they are installed, so Auvyx blocks set in them
		// read as the brief says (a font that could not be installed leaves them as they were).
		$roles = array(
			'auvyx-heading' => (string) ( $preset['fonts']['heading'] ?? '' ),
			'auvyx-body'    => (string) ( $preset['fonts']['body'] ?? '' ),
		);
		foreach ( $families as $i => $family ) {
			$role = is_array( $family ) ? ( $roles[ (string) ( $family['slug'] ?? '' ) ] ?? '' ) : '';
			if ( '' !== $role && Fonts::css( $role ) !== $role ) {
				$families[ $i ]['fontFamily'] = Fonts::css( $role );
			}
		}
		$update['settings']['typography']['fontFamilies'] = array_values( $families );
		if ( isset( $preset['fonts']['body'] ) ) {
			$update['styles']['typography']['fontFamily'] = Fonts::css( $preset['fonts']['body'] );
		}
		if ( isset( $preset['fonts']['heading'] ) ) {
			$update['styles']['elements']['heading']['typography']['fontFamily'] = Fonts::css( $preset['fonts']['heading'] );
		}
		// Type levels.
		$type = (array) ( $preset['type'] ?? array() );
		$css  = static function ( array $level ): array {
			$out = array();
			if ( isset( $level['fontFamily'] ) ) {
				$out['fontFamily'] = Fonts::css( $level['fontFamily'] );
			}
			if ( isset( $level['fontSize'] ) ) {
				$out['fontSize'] = self::fluid( $level['fontSize'] );
			}
			foreach ( array( 'fontWeight', 'letterSpacing' ) as $key ) {
				if ( isset( $level[ $key ] ) ) {
					$out[ $key ] = $level[ $key ];
				}
			}
			if ( isset( $level['lineHeight'] ) ) {
				$out['lineHeight'] = self::relative_line_height( $level['lineHeight'], $level['fontSize'] ?? '' );
			}
			return $out;
		};
		foreach ( array(
			'h1' => $type['h1'] ?? ( $type['display'] ?? null ),
			'h2' => $type['h2'] ?? null,
			'h3' => $type['h3'] ?? null,
		) as $element => $level ) {
			if ( $level ) {
				$update['styles']['elements'][ $element ]['typography'] = $css( $level );
			}
		}
		if ( isset( $type['body'] ) ) {
			$update['styles']['typography'] = array_merge( $update['styles']['typography'] ?? array(), $css( $type['body'] ) );
		}
		if ( isset( $type['display']['fontSize'] ) ) {
			$sizes = $data['settings']['typography']['fontSizes'] ?? array();
			$sizes = is_array( $sizes ) && isset( $sizes['theme'] ) ? $sizes['theme'] : ( is_array( $sizes ) ? $sizes : array() );
			foreach ( $sizes as $i => $size ) {
				if ( 'display' === ( $size['slug'] ?? '' ) ) {
					$sizes[ $i ]['size']  = self::fluid( $type['display']['fontSize'] );
					$sizes[ $i ]['fluid'] = false;
				}
			}
			$update['settings']['typography']['fontSizes'] = array_values( $sizes );
		}
		// Shapes, spacing, inputs.
		foreach ( (array) ( $preset['radii'] ?? array() ) as $size => $value ) {
			$update['settings']['custom']['radius'][ $size ] = $value;
		}
		if ( ! empty( $preset['spacing'] ) ) {
			$map     = array(
				'xs' => '20',
				'sm' => '30',
				'md' => '40',
				'lg' => '50',
				'xl' => '60',
			);
			$spacing = $data['settings']['spacing']['spacingSizes'] ?? array();
			$spacing = is_array( $spacing ) && isset( $spacing['theme'] ) ? $spacing['theme'] : ( is_array( $spacing ) ? $spacing : array() );
			foreach ( $spacing as $i => $size ) {
				$key = array_search( (string) ( $size['slug'] ?? '' ), $map, true );
				if ( false !== $key && isset( $preset['spacing'][ $key ] ) ) {
					$spacing[ $i ]['size'] = $preset['spacing'][ $key ];
				}
			}
			$update['settings']['spacing']['spacingSizes'] = array_values( $spacing );
		}
		// Shadows: the theme's own levels of the same name (Auvyx Theme's sm, md, lg) take the brief's, so its cards and
		// menus follow; the Auvyx levels (auvyx-sm …) come from the Auvyx tokens (DesignSystem::inject_tokens).
		if ( ! empty( $preset['shadows'] ) ) {
			$shadows = $data['settings']['shadow']['presets'] ?? array();
			$shadows = is_array( $shadows ) && isset( $shadows['theme'] ) ? $shadows['theme'] : ( is_array( $shadows ) ? $shadows : array() );
			$found   = false;
			foreach ( $shadows as $i => $shadow ) {
				$slug = is_array( $shadow ) ? (string) ( $shadow['slug'] ?? '' ) : '';
				if ( isset( $preset['shadows'][ $slug ] ) ) {
					$shadows[ $i ]['shadow'] = $preset['shadows'][ $slug ];
					$found                   = true;
				}
			}
			if ( $found ) {
				$update['settings']['shadow']['presets'] = array_values( $shadows );
			}
		}
		foreach ( (array) ( $preset['input'] ?? array() ) as $key => $value ) {
			$update['settings']['custom']['input'][ $key ] = $value;
		}
		// Buttons beyond colors and radius.
		$button = (array) ( $preset['button'] ?? array() );
		if ( isset( $button['padding'] ) ) {
			$p = (float) $button['padding'];
			$u = preg_replace( '/[\d.]/', '', $button['padding'] );
			$update['styles']['elements']['button']['spacing']['padding'] = array(
				'top'    => min( $p, 'px' === $u ? 16 : 1 ) . $u,
				'bottom' => min( $p, 'px' === $u ? 16 : 1 ) . $u,
				'left'   => max( $p * 1.5, 'px' === $u ? 20 : 1.25 ) . $u,
				'right'  => max( $p * 1.5, 'px' === $u ? 20 : 1.25 ) . $u,
			);
		}
		foreach ( array( 'fontWeight', 'letterSpacing', 'fontSize' ) as $key ) {
			if ( isset( $button[ $key ] ) ) {
				$update['styles']['elements']['button']['typography'][ $key ] = $button[ $key ];
			}
		}
		if ( isset( $button['hoverBackground'] ) ) {
			$update['styles']['elements']['button'][':hover']['color']['background'] = $button['hoverBackground'];
			$update['styles']['elements']['button'][':hover']['color']['text']       = $button['hoverText'] ?? ( $preset['colors']['onPrimary'] ?? '#ffffff' );
		}
		if ( array() === $update['styles'] ) {
			unset( $update['styles'] );
		}
		return $theme_json->update_with( $update );
	}

	/** Big sizes shrink on small screens: 44px → clamp(29px, 2.75rem + 1vw … ). */
	public static function fluid( string $size ): string {
		if ( ! preg_match( '/^(\d*\.?\d+)(px|rem|em)$/', $size, $m ) ) {
			return $size;
		}
		$px = 'px' === $m[2] ? (float) $m[1] : (float) $m[1] * 16;
		if ( $px <= 28 ) {
			return $size;
		}
		$min = max( 24, round( $px * 0.62 ) );
		return sprintf( 'clamp(%1$dpx, %2$.2fvw + %3$.2fpx, %4$dpx)', $min, ( $px - $min ) / 10.24, $min - ( $px - $min ) * 0.375, round( $px ) );
	}

	/** `52px` line height on a 44px size → 1.18 (scales with the fluid size). */
	public static function relative_line_height( string $line, string $size ): string {
		if ( preg_match( '/^(\d*\.?\d+)px$/', $line, $l ) && preg_match( '/^(\d*\.?\d+)px$/', $size, $s ) && (float) $s[1] > 0 ) {
			return (string) round( (float) $l[1] / (float) $s[1], 2 );
		}
		return $line;
	}
}
