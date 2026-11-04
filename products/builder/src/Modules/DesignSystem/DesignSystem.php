<?php
/**
 * Breakpoints and design tokens.
 *
 * Tokens are injected into the theme layer of theme.json, so they become
 * --wp--preset--* variables usable by core blocks, other plugins and Global
 * Styles. The user's own Global Styles edits are never overwritten (ADR 0005).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\DesignSystem;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class DesignSystem implements Module {

	const OPTION = 'auvyx_design_system';

	/** @var array<string, mixed> */
	private $defaults;

	/** @var array<string, mixed>|null */
	private $resolved;

	/**
	 * @param array<string, mixed> $defaults shared/defaults/design-system.json.
	 */
	public function __construct( array $defaults ) {
		$this->defaults = $defaults;
	}

	public function id(): string {
		return 'design-system';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_filter( 'wp_theme_json_data_theme', array( $this, 'inject_tokens' ) );
		// After the tokens: a design preset (DESIGN.md) recolors the theme's own palette, fonts and buttons.
		add_filter( 'wp_theme_json_data_theme', array( Brief::class, 'inject' ), 20 );
		add_action( 'wp_head', array( Brief::class, 'print_surface' ), 5 );
		add_action( 'wp_head', array( $this, 'print_typography' ), 6 );
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
		add_action( 'update_option_' . self::OPTION, array( $this, 'flush' ) );
		add_action( 'add_option_' . self::OPTION, array( $this, 'flush' ) );
	}

	/**
	 * `POST /auvyx/v1/design/brief` {markdown}: the Studio's agent (and anyone who may change the look) gives the site a new
	 * look as a DESIGN.md: it is kept as the brief, read (its front matter exactly; prose by the AI when it is set up) and
	 * applied to the Auvyx tokens and the theme (palette, fonts, corners, buttons). Answers what was applied.
	 */
	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			'/design/brief',
			array(
				'methods'             => 'POST',
				'permission_callback' => static fn() => current_user_can( 'edit_theme_options' ),
				'callback'            => static function ( $request ) {
					$markdown = (string) $request->get_param( 'markdown' );
					if ( '' === trim( $markdown ) || strlen( $markdown ) > 100000 ) {
						return new \WP_REST_Response( array( 'message' => 'Expected a DESIGN.md' ), 400 );
					}
					Brief::save_brief( $markdown );
					$exact  = Brief::from_brief( $markdown );
					$preset = $exact ? $exact : ( \Auvyx\Builder\Modules\Ai\Ai::configured() ? Brief::from_ai( $markdown ) : array() );
					if ( is_wp_error( $preset ) ) {
						return new \WP_REST_Response( array( 'message' => $preset->get_error_message() ), 400 );
					}
					if ( array() === $preset ) {
						return new \WP_REST_Response( array( 'message' => 'No colors, fonts or corners found in the DESIGN.md' ), 400 );
					}
					$problems = Brief::apply( $preset );
					return new \WP_REST_Response(
						array(
							'preset'   => $preset,
							'problems' => array_values( $problems ),
						)
					);
				},
			)
		);
	}

	/**
	 * Saved option (if valid) over defaults.
	 *
	 * @return array{version: int, breakpoints: array<int, array<string, mixed>>, tokens: array<string, array<int, array<string, string>>>}
	 */
	public function get(): array {
		if ( null !== $this->resolved ) {
			return $this->resolved;
		}
		$saved = get_option( self::OPTION, array() );
		$saved = is_array( $saved ) ? $saved : array();

		$breakpoints = self::sanitize_breakpoints( $saved['breakpoints'] ?? null );
		if ( array() === $breakpoints ) {
			$breakpoints = $this->defaults['breakpoints'];
		}

		$tokens = $this->defaults['tokens'];
		if ( isset( $saved['tokens'] ) && is_array( $saved['tokens'] ) ) {
			foreach ( array_keys( $tokens ) as $type ) {
				if ( isset( $saved['tokens'][ $type ] ) && is_array( $saved['tokens'][ $type ] ) ) {
					// Saved values over the defaults, slug by slug: a brand that names some colors keeps the others (a missing
					// token would leave every `var()` that reads it empty, a dark band without its colour).
					$own    = self::sanitize_presets( $saved['tokens'][ $type ], 'color' === $type ? 'color' : 'size' );
					$by     = array_column( $own, null, 'slug' );
					$merged = array();
					foreach ( $tokens[ $type ] as $default ) {
						$merged[] = $by[ $default['slug'] ] ?? $default;
						unset( $by[ $default['slug'] ] );
					}
					$tokens[ $type ] = array_merge( $merged, array_values( $by ) );
				}
			}
		}

		// Shadows have no defaults (the theme's own stay): only a brand's (DESIGN.md `elevation`) adds Auvyx shadow tokens.
		if ( isset( $saved['tokens']['shadow'] ) && is_array( $saved['tokens']['shadow'] ) ) {
			$shadows = self::sanitize_presets( $saved['tokens']['shadow'], 'shadow' );
			if ( $shadows ) {
				$tokens['shadow'] = $shadows;
			}
		}

		$this->resolved = array(
			'version'     => 1,
			'breakpoints' => $breakpoints,
			'tokens'      => $tokens,
		);
		return $this->resolved;
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public function breakpoints(): array {
		return $this->get()['breakpoints'];
	}

	public function flush(): void {
		$this->resolved = null;
	}

	/** Plain :root variables for Auvyx color tokens (classic themes may omit them from global-styles). */
	public function color_variable_css(): string {
		$parts = array();
		foreach ( (array) ( $this->get()['tokens']['color'] ?? array() ) as $preset ) {
			if ( ! is_array( $preset ) ) {
				continue;
			}
			$slug  = (string) ( $preset['slug'] ?? '' );
			$color = (string) ( $preset['color'] ?? '' );
			if ( '' === $slug || '' === $color || 0 === strpos( $color, 'var(' ) ) {
				continue;
			}
			$parts[] = '--wp--preset--color--' . $slug . ':' . $color;
		}
		return $parts ? ':root{' . implode( ';', $parts ) . ';}' : '';
	}

	/**
	 * Font-size variables. Classic themes print their own scale and not the Auvyx slugs, so
	 * `var(--wp--preset--font-size--auvyx-xl)` is empty and every library heading falls back to body size.
	 * A size nobody saved follows the theme's scale (the same roles as theme.json) when that theme defines it.
	 */
	public function typography_variable_css(): string {
		$sizes = array();
		foreach ( (array) ( $this->get()['tokens']['fontSize'] ?? array() ) as $preset ) {
			if ( is_array( $preset ) && isset( $preset['slug'] ) ) {
				$sizes[] = $preset;
			}
		}
		$saved = get_option( self::OPTION, array() );
		$own   = is_array( $saved['tokens']['fontSize'] ?? null ) && array() !== $saved['tokens']['fontSize'];
		if ( ! $own && function_exists( 'wp_get_global_settings' ) ) {
			$theme = wp_get_global_settings( array( 'typography', 'fontSizes' ) );
			$list  = is_array( $theme ) && isset( $theme['theme'] ) && is_array( $theme['theme'] ) ? $theme['theme'] : array();
			$slugs = array();
			foreach ( $list as $preset ) {
				if ( is_array( $preset ) && isset( $preset['slug'] ) ) {
					$slugs[] = array( 'slug' => (string) $preset['slug'] );
				}
			}
			if ( array() !== $slugs ) {
				$sizes = self::follow_theme( $sizes, $slugs, self::SIZE_ROLES, 'size', 'font-size' );
			}
		}
		$parts = array();
		foreach ( $sizes as $preset ) {
			$slug = (string) ( $preset['slug'] ?? '' );
			$size = self::safe_token_value( (string) ( $preset['size'] ?? '' ) );
			if ( ! preg_match( '/^[a-z0-9-]+$/', $slug ) || '' === $size ) {
				continue;
			}
			$parts[] = '--wp--preset--font-size--' . $slug . ':' . $size;
		}
		return $parts ? ':root{' . implode( ';', $parts ) . ';}' : '';
	}

	/** `has-*-font-size` utilities. Without these, a theme's `h2` rule beats the block class. */
	public function typography_utility_css(): string {
		$rules = array();
		foreach ( (array) ( $this->get()['tokens']['fontSize'] ?? array() ) as $preset ) {
			if ( ! is_array( $preset ) ) {
				continue;
			}
			$slug = (string) ( $preset['slug'] ?? '' );
			if ( ! preg_match( '/^[a-z0-9-]+$/', $slug ) ) {
				continue;
			}
			$rules[] = '.has-' . $slug . '-font-size{font-size:var(--wp--preset--font-size--' . $slug . ') !important}';
		}
		return implode( '', $rules );
	}

	/** Printed on the front so a classic theme's missing global styles do not drop the type scale. */
	public function print_typography(): void {
		if ( is_admin() ) {
			return;
		}
		$css = $this->typography_variable_css() . $this->typography_utility_css();
		if ( '' === $css ) {
			return;
		}
		// CSS from the design tokens; tags stripped so nothing can close the style element (HTML escaping would break CSS).
		echo '<style id="auvyx-token-type">' . wp_strip_all_tags( $css ) . "</style>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * A token value safe to print inside a style rule: lengths, clamp(), calc(), and var().
	 *
	 * @param string $value Raw token.
	 */
	private static function safe_token_value( $value ): string {
		$value = trim( (string) $value );
		if ( '' === $value || strlen( $value ) > 200 || 1 === preg_match( '/[;{}<>\\\\]|expression\(|url\(/i', $value ) ) {
			return '';
		}
		return 1 === preg_match( '/^[a-z0-9 .,%()+_-]+$/i', $value ) ? $value : '';
	}

	/** `has-*` utilities. Classic themes omit these, so a preset color class never paints. */
	public function color_utility_css(): string {
		$rules = array();
		foreach ( (array) ( $this->get()['tokens']['color'] ?? array() ) as $preset ) {
			if ( ! is_array( $preset ) ) {
				continue;
			}
			$slug  = (string) ( $preset['slug'] ?? '' );
			$color = (string) ( $preset['color'] ?? '' );
			if ( ! preg_match( '/^[a-z0-9-]+$/', $slug ) || '' === $color || 0 === strpos( $color, 'var(' ) ) {
				continue;
			}
			$rules[] = '.has-' . $slug . '-color{color:var(--wp--preset--color--' . $slug . ') !important}';
			$rules[] = '.has-' . $slug . '-background-color{background-color:var(--wp--preset--color--' . $slug . ') !important}';
		}
		return implode( '', $rules );
	}

	/**
	 * @param \WP_Theme_JSON_Data $theme_json Theme layer.
	 * @return \WP_Theme_JSON_Data
	 */
	public function inject_tokens( $theme_json ) {
		$data   = $theme_json->get_data();
		$tokens = $this->get()['tokens'];
		// Colors nobody chose follow the theme: each Auvyx color points at the theme's color of the same role, so Auvyx
		// elements match its screens (and its style variations and DESIGN.md recolors, which change those roles).
		$saved = get_option( self::OPTION, array() );
		// Colors nobody chose (none saved, or not among the saved ones) follow the theme.
		$chosen   = array_column( is_array( $saved['tokens']['color'] ?? null ) ? $saved['tokens']['color'] : array(), 'slug' );
		$followed = self::follow_theme( $tokens['color'], $data['settings']['color']['palette'] ?? array() );
		foreach ( $tokens['color'] as $i => $color ) {
			if ( ! in_array( $color['slug'], $chosen, true ) && isset( $followed[ $i ] ) ) {
				$tokens['color'][ $i ] = $followed[ $i ];
			}
		}
		if ( empty( $saved['tokens']['fontSize'] ) ) {
			$tokens['fontSize'] = self::follow_theme( $tokens['fontSize'], $data['settings']['typography']['fontSizes'] ?? array(), self::SIZE_ROLES, 'size', 'font-size' );
		}
		if ( empty( $saved['tokens']['fontFamily'] ) ) {
			$tokens['fontFamily'] = self::follow_theme( $tokens['fontFamily'], $data['settings']['typography']['fontFamilies'] ?? array(), self::FONT_ROLES, 'size', 'font-family' );
		}

		$palette = self::merge_presets( $data['settings']['color']['palette'] ?? array(), $tokens['color'] );
		// The other way on the Auvyx theme: colors someone chose (the Design screen, the AI) recolor the theme's own roles too,
		// so its header, footer, buttons and store screens follow the brand as they do on EzyPlatform.
		if ( ! empty( $saved['tokens']['color'] ) && self::AUVYX_THEME === get_template() ) {
			$palette = self::brand_theme( $palette, $tokens['color'] );
		}

		$settings = array(
			'color'      => array(
				'palette' => $palette,
			),
			'spacing'    => array(
				'spacingSizes' => self::merge_presets( $data['settings']['spacing']['spacingSizes'] ?? array(), $tokens['spacing'] ),
			),
			'typography' => array(
				'fontSizes'    => self::merge_presets( $data['settings']['typography']['fontSizes'] ?? array(), $tokens['fontSize'] ),
				'fontFamilies' => self::merge_presets( $data['settings']['typography']['fontFamilies'] ?? array(), self::font_families( $tokens['fontFamily'] ) ),
			),
		);
		// --wp--preset--shadow--auvyx-*: the block editor's shadow picker and the agent's audit (which reads --shadow-- tokens).
		if ( ! empty( $tokens['shadow'] ) ) {
			$settings['shadow'] = array( 'presets' => self::merge_presets( $data['settings']['shadow']['presets'] ?? array(), $tokens['shadow'] ) );
		}

		return $theme_json->update_with(
			array(
				'version'  => 3,
				'settings' => $settings,
			)
		);
	}

	/**
	 * The design system as Auvyx Studio shows it: colors that follow the theme carry the theme's actual values (pickers
	 * and swatches cannot read CSS variables outside the page).
	 *
	 * @return array<string, mixed>
	 */
	public function for_studio(): array {
		$system = $this->get();
		$saved  = get_option( self::OPTION, array() );
		if ( function_exists( 'wp_get_global_settings' ) ) {
			$palette = wp_get_global_settings( array( 'color', 'palette' ) );
			$theme   = array_column( (array) ( $palette['theme'] ?? array() ), 'color', 'slug' );
			foreach ( self::follow_theme( $system['tokens']['color'], array_map( static fn( $slug ) => array( 'slug' => $slug ), array_keys( $theme ) ) ) as $i => $color ) {
				$chosen = in_array( $color['slug'], array_column( is_array( $saved['tokens']['color'] ?? null ) ? $saved['tokens']['color'] : array(), 'slug' ), true );
				if ( ! $chosen && preg_match( '/^var\(--wp--preset--color--([a-z0-9-]+)\)$/', $color['color'], $m ) && isset( $theme[ $m[1] ] ) ) {
					$system['tokens']['color'][ $i ]['color'] = (string) $theme[ $m[1] ];
				}
			}
		}
		if ( empty( $saved['tokens']['fontSize'] ) && function_exists( 'wp_get_global_settings' ) ) {
			$sizes = wp_get_global_settings( array( 'typography', 'fontSizes' ) );
			$theme = array_column( (array) ( $sizes['theme'] ?? array() ), 'size', 'slug' );
			foreach ( self::follow_theme( $system['tokens']['fontSize'], array_map( static fn( $slug ) => array( 'slug' => $slug ), array_keys( $theme ) ), self::SIZE_ROLES, 'size', 'font-size' ) as $i => $size ) {
				if ( preg_match( '/^var\(--wp--preset--font-size--([a-z0-9-]+)\)$/', $size['size'], $m ) && isset( $theme[ $m[1] ] ) && is_string( $theme[ $m[1] ] ) ) {
					$system['tokens']['fontSize'][ $i ]['size'] = $theme[ $m[1] ];
				}
			}
		}
		return $system;
	}

	/** Auvyx color → theme roles it follows, first found wins.
	 * Auvyx Theme names, then Twenty Twenty-Five (`accent-1`), Kadence (`theme-palette1`) and Astra (`ast-global-color-0`).
	 */
	const ROLES = array(
		'auvyx-primary'    => array( 'accent', 'accent-1', 'primary', 'theme-palette1', 'ast-global-color-0', 'contrast', 'foreground' ),
		'auvyx-secondary'  => array( 'contrast', 'secondary', 'theme-palette2', 'ast-global-color-1', 'foreground' ),
		'auvyx-accent'     => array( 'sale', 'accent-2', 'secondary', 'accent', 'theme-palette10', 'ast-global-color-1' ),
		'auvyx-surface'    => array( 'surface', 'base-2', 'tertiary', 'theme-palette8', 'ast-global-color-5', 'base' ),
		'auvyx-text'       => array( 'contrast', 'foreground', 'theme-palette3', 'ast-global-color-3' ),
		'auvyx-inverse'    => array( 'base', 'background', 'theme-palette9', 'ast-global-color-4' ),
		'auvyx-on-primary' => array( 'accent-contrast', 'base', 'background', 'theme-palette9', 'ast-global-color-4' ),
		'auvyx-base'       => array( 'base', 'background', 'theme-palette9', 'ast-global-color-4' ),
		'auvyx-muted'      => array( 'muted', 'contrast-2', 'secondary', 'theme-palette5', 'ast-global-color-2' ),
		'auvyx-border'     => array( 'border', 'base-3', 'tertiary', 'theme-palette7', 'ast-global-color-6' ),
	);

	/** The Auvyx theme's folder (products/theme). */
	const AUVYX_THEME = 'auvyx-theme';

	/** The Auvyx theme's color roles and the Auvyx token each takes when a brand is set (the inverse of ROLES on that theme). */
	const BRAND_ROLES = array(
		'accent'          => 'auvyx-primary',
		'accent-contrast' => 'auvyx-on-primary',
		'contrast'        => 'auvyx-text',
		'base'            => 'auvyx-base',
		'surface'         => 'auvyx-surface',
		'muted'           => 'auvyx-muted',
		'border'          => 'auvyx-border',
		'sale'            => 'auvyx-accent',
	);

	/**
	 * The theme palette with its roles set to the brand's Auvyx colors (a role whose token is not a plain color stays).
	 *
	 * @param array<int, array<string, string>> $palette Merged palette.
	 * @param array<int, array<string, string>> $colors  Auvyx color presets.
	 * @return array<int, array<string, string>>
	 */
	public static function brand_theme( array $palette, array $colors ): array {
		$values = array_column( $colors, 'color', 'slug' );
		foreach ( $palette as $i => $preset ) {
			$token = self::BRAND_ROLES[ $preset['slug'] ?? '' ] ?? '';
			if ( '' !== $token && isset( $values[ $token ] ) && 0 !== strpos( (string) $values[ $token ], 'var(' ) ) {
				$palette[ $i ]['color'] = $values[ $token ];
			}
		}
		return $palette;
	}

	/** Auvyx font sizes → the theme's type scale (Twenty Twenty-Five, Astra, and Kadence's `larger` / `xxlarge`). */
	const SIZE_ROLES = array(
		'auvyx-sm'  => array( 'small' ),
		'auvyx-md'  => array( 'medium' ),
		'auvyx-lg'  => array( 'large' ),
		'auvyx-xl'  => array( 'x-large', 'larger' ),
		'auvyx-xxl' => array( 'xx-large', 'xxlarge', 'x-large' ),
	);

	/** Auvyx font families → the theme's families (Twenty Twenty-Five ships Manrope). */
	const FONT_ROLES = array(
		'auvyx-body'    => array( 'body', 'manrope', 'system-font' ),
		'auvyx-heading' => array( 'heading', 'display', 'manrope' ),
	);

	/**
	 * Auvyx presets as references to the theme's presets of the same role (kept as they are when the theme has none):
	 * colors by default, font sizes with SIZE_ROLES.
	 *
	 * @param array<int, array<string, string>> $colors  Auvyx presets.
	 * @param mixed                             $palette Theme presets (by origin or a list).
	 * @param array<string, string[]>|null      $roles   Auvyx slug → theme slugs, first found wins.
	 * @param string                            $key     Value key of a preset.
	 * @param string                            $kind    CSS variable kind.
	 * @return array<int, array<string, string>>
	 */
	public static function follow_theme( array $colors, $palette, ?array $roles = null, string $key = 'color', string $kind = 'color' ): array {
		$roles = $roles ?? self::ROLES;
		if ( is_array( $palette ) && isset( $palette['theme'] ) && is_array( $palette['theme'] ) ) {
			$palette = $palette['theme'];
		}
		$slugs = is_array( $palette ) ? array_column( array_filter( $palette, 'is_array' ), 'slug' ) : array();
		foreach ( $colors as $i => $color ) {
			foreach ( $roles[ $color['slug'] ] ?? array() as $role ) {
				if ( in_array( $role, $slugs, true ) ) {
					$colors[ $i ][ $key ] = 'var(--wp--preset--' . $kind . '--' . $role . ')';
					break;
				}
			}
		}
		return $colors;
	}

	/**
	 * Auvyx font tokens use `size` for the family stack. theme.json wants `fontFamily`.
	 *
	 * @param array<int, array<string, mixed>> $fonts Auvyx font-family presets.
	 * @return array<int, array<string, string>>
	 */
	public static function font_families( array $fonts ): array {
		$out = array();
		foreach ( $fonts as $font ) {
			if ( ! is_array( $font ) || empty( $font['slug'] ) ) {
				continue;
			}
			$stack = (string) ( $font['fontFamily'] ?? $font['size'] ?? 'sans-serif' );
			$out[] = array(
				'slug'       => (string) $font['slug'],
				'name'       => (string) ( $font['name'] ?? $font['slug'] ),
				'fontFamily' => $stack,
			);
		}
		return $out;
	}

	/**
	 * Appends presets whose slug the theme does not already define.
	 *
	 * Inside the filter, raw data stores presets by origin ({"theme": [...]});
	 * a plain list is accepted too.
	 *
	 * @param mixed                            $existing Theme presets.
	 * @param array<int, array<string, mixed>> $ours     Auvyx presets.
	 * @return array<int, array<string, mixed>>
	 */
	private static function merge_presets( $existing, array $ours ): array {
		if ( is_array( $existing ) && isset( $existing['theme'] ) && is_array( $existing['theme'] ) ) {
			$existing = $existing['theme'];
		}
		$existing = is_array( $existing ) ? array_values(
			array_filter(
				$existing,
				static function ( $preset ) {
					return is_array( $preset ) && isset( $preset['slug'] );
				}
			)
		) : array();
		$slugs    = array_column( $existing, 'slug' );
		foreach ( $ours as $preset ) {
			if ( ! in_array( $preset['slug'], $slugs, true ) ) {
				$existing[] = $preset;
			}
		}
		return $existing;
	}

	/**
	 * @param mixed $input Raw breakpoints.
	 * @return array<int, array<string, mixed>>
	 */
	private static function sanitize_breakpoints( $input ): array {
		if ( ! is_array( $input ) ) {
			return array();
		}
		$output   = array();
		$has_base = false;
		foreach ( $input as $breakpoint ) {
			if ( ! is_array( $breakpoint ) || ! isset( $breakpoint['id'] ) || ! is_string( $breakpoint['id'] ) || 1 !== preg_match( '/^[a-z][a-z0-9-]*$/', $breakpoint['id'] ) ) {
				continue;
			}
			$clean = array(
				'id'    => $breakpoint['id'],
				'label' => sanitize_text_field( (string) ( $breakpoint['label'] ?? $breakpoint['id'] ) ),
			);
			foreach ( array( 'minWidth', 'maxWidth' ) as $key ) {
				if ( isset( $breakpoint[ $key ] ) && is_numeric( $breakpoint[ $key ] ) && (int) $breakpoint[ $key ] > 0 ) {
					$clean[ $key ] = (int) $breakpoint[ $key ];
				}
			}
			$has_base = $has_base || ( ! isset( $clean['minWidth'] ) && ! isset( $clean['maxWidth'] ) );
			$output[] = $clean;
		}
		return $has_base ? $output : array();
	}

	/**
	 * @param array<int, mixed> $input Raw presets.
	 * @param string            $value_key 'color', 'size' or 'shadow'.
	 * @return array<int, array<string, string>>
	 */
	private static function sanitize_presets( array $input, string $value_key ): array {
		$output = array();
		foreach ( $input as $preset ) {
			if ( ! is_array( $preset ) || empty( $preset['slug'] ) || ! isset( $preset[ $value_key ] ) || ! is_string( $preset[ $value_key ] ) ) {
				continue;
			}
			$value = trim( sanitize_text_field( $preset[ $value_key ] ) );
			// Values go into theme.json as CSS: colors, lengths and shadows only, never anything that could close a rule.
			if ( 'shadow' === $value_key ) {
				$ok = strlen( $value ) <= 300 && ! preg_match( '/url\(|expression\(/i', $value ) && (bool) preg_match( '/^[a-zA-Z0-9 #.,()%\/+-]+$/', $value );
			} else {
				$ok = 'color' === $value_key
					? (bool) preg_match( '/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|var\(--[\w-]+\))$/', $value )
					: (bool) preg_match( '/^(-?\d*\.?\d+(px|rem|em|%|vw|vh|ch)|(clamp|min|max|calc)\([\w\s.,%+*\/()-]+\)|var\(--[\w-]+\))$/', $value );
			}
			if ( ! $ok ) {
				continue;
			}
			$output[] = array(
				'slug'     => sanitize_key( (string) $preset['slug'] ),
				'name'     => sanitize_text_field( (string) ( $preset['name'] ?? $preset['slug'] ) ),
				$value_key => $value,
			);
		}
		return $output;
	}
}
