<?php
/**
 * WordPress host adapter for design tokens.
 *
 * The canonical tokens stay Auvyx's. This module reads the active theme: a block theme's
 * theme.json (through the theme.json data filter the design system already applies) and,
 * for a classic theme, the colors and font in its stylesheet. Rendered blocks gain the
 * standard `has-*` classes. A section marked `auvyx-isolated` gets a scoped reset. A section
 * marked `auvyx-shadow` renders as a declarative shadow root so a theme `!important` stays outside.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\ThemeAdapter;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;
use Auvyx\Builder\StyleEngine\StyleEngine;

defined( 'ABSPATH' ) || exit;

final class ThemeAdapter implements Module {

	const HANDLE = 'auvyx-theme-mode';

	/** @var StyleEngine */
	private $engine;

	/** @var DesignSystem */
	private $design_system;

	public function __construct( StyleEngine $engine, DesignSystem $design_system ) {
		$this->engine        = $engine;
		$this->design_system = $design_system;
	}

	public function id(): string {
		return 'theme-adapter';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		// After DesignSystem (10) and a design brief (20), so a classic theme can fill tokens nobody chose.
		add_filter( 'wp_theme_json_data_theme', array( $this, 'classic_tokens' ), 30 );
		add_filter( 'render_block', array( $this, 'render_block' ), 15, 2 );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ), 101 );
	}

	/**
	 * Classic themes have no theme.json. Body color, background and font-family from the
	 * theme stylesheet become the Auvyx text, base and body tokens when the site has not chosen its own.
	 *
	 * @param \WP_Theme_JSON_Data $theme_json Theme layer.
	 * @return \WP_Theme_JSON_Data
	 */
	public function classic_tokens( $theme_json ) {
		if ( function_exists( 'wp_theme_has_theme_json' ) && wp_theme_has_theme_json() ) {
			return $theme_json;
		}
		$derived = ThemeTokens::from_css( self::editor_css() );
		if ( '' === $derived['color'] && '' === $derived['background'] && '' === $derived['fontFamily'] ) {
			return $theme_json;
		}
		$saved   = get_option( DesignSystem::OPTION, array() );
		$chosen  = array_column( is_array( $saved['tokens']['color'] ?? null ) ? $saved['tokens']['color'] : array(), 'slug' );
		$fonts   = is_array( $saved['tokens']['fontFamily'] ?? null ) ? $saved['tokens']['fontFamily'] : array();
		$data    = $theme_json->get_data();
		$palette = self::preset_list( $data['settings']['color']['palette'] ?? array() );
		foreach ( $palette as $i => $preset ) {
			$slug = (string) ( $preset['slug'] ?? '' );
			if ( in_array( $slug, $chosen, true ) ) {
				continue;
			}
			if ( 'auvyx-text' === $slug && '' !== $derived['color'] ) {
				$palette[ $i ]['color'] = $derived['color'];
			}
			if ( 'auvyx-base' === $slug && '' !== $derived['background'] ) {
				$palette[ $i ]['color'] = $derived['background'];
			}
		}
		$families = self::preset_list( $data['settings']['typography']['fontFamilies'] ?? array() );
		if ( array() === $fonts && '' !== $derived['fontFamily'] ) {
			foreach ( $families as $i => $preset ) {
				$slug = (string) ( $preset['slug'] ?? '' );
				if ( 'auvyx-body' === $slug || 'auvyx-heading' === $slug ) {
					$families[ $i ]['fontFamily'] = $derived['fontFamily'];
				}
			}
		}
		return $theme_json->update_with(
			array(
				'version'  => 3,
				'settings' => array(
					'color'      => array( 'palette' => $palette ),
					'typography' => array( 'fontFamilies' => $families ),
				),
			)
		);
	}

	/**
	 * Stylesheet text a classic theme hands the editor: the theme's own style.css, read locally.
	 */
	public static function editor_css(): string {
		$dirs = array();
		if ( function_exists( 'get_stylesheet_directory' ) ) {
			$dirs[] = get_stylesheet_directory();
		}
		if ( function_exists( 'get_template_directory' ) ) {
			$dirs[] = get_template_directory();
		}
		$css = '';
		foreach ( array_unique( $dirs ) as $dir ) {
			foreach ( array( 'style.css', 'editor-style.css', 'assets/css/style.css' ) as $rel ) {
				$path = $dir . '/' . $rel;
				if ( is_readable( $path ) ) {
					$css .= (string) file_get_contents( $path, false, null, 0, 120000 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local theme file, capped.
				}
			}
		}
		return $css;
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render_block( $html, $block ): string {
		$html = (string) $html;
		$name = (string) ( $block['blockName'] ?? '' );
		if ( '' === $html || 0 !== strpos( $name, 'auvyx/' ) ) {
			return $html;
		}
		$classes = ThemeTokens::utility_classes( ThemeTokens::base_declarations( $block['attrs']['auvyx']['styles'] ?? array() ) );
		if ( array() !== $classes ) {
			$processor = new \WP_HTML_Tag_Processor( $html );
			if ( $processor->next_tag() ) {
				foreach ( $classes as $class ) {
					$processor->add_class( $class );
				}
				$html = $processor->get_updated_html();
			}
		}
		if ( 'auvyx/section' !== $name ) {
			return $html;
		}
		$class = (string) ( $block['attrs']['className'] ?? '' );
		$mode  = false !== strpos( $class, ThemeTokens::SHADOW ) ? 'shadow' : ( false !== strpos( $class, ThemeTokens::ISOLATED ) ? 'isolated' : '' );
		if ( 'shadow' !== $mode ) {
			return $html;
		}
		$interactive = false !== strpos( $html, 'auvyx-slider' ) || false !== strpos( $html, 'wp-block-auvyx-nav' ) || false !== strpos( $html, 'wp-block-auvyx-carousel' ) || false !== strpos( $html, 'data-auvyx-autoplay' );
		return ThemeTokens::shadow_html( $html, $this->subtree_css( $block ), self::token_vars(), $interactive, 'shadow' );
	}

	/**
	 * Compiled rules for this section and its descendants. They live in the page stylesheet, which
	 * does not paint inside a shadow root, so the shadow tree needs its own copy.
	 *
	 * @param array<string, mixed> $block Parsed block.
	 */
	private function subtree_css( array $block ): string {
		$css  = '';
		$walk = function ( $node ) use ( &$walk, &$css ) {
			if ( ! is_array( $node ) ) {
				return;
			}
			$name = (string) ( $node['blockName'] ?? '' );
			if ( 0 === strpos( $name, 'auvyx/' ) ) {
				$auvyx    = is_array( $node['attrs']['auvyx'] ?? null ) ? $node['attrs']['auvyx'] : array();
				$compiled = array_filter(
					array(
						empty( $auvyx['styles'] ) ? null : $this->engine->compile_block( $auvyx['styles'], $this->design_system->breakpoints() ),
						empty( $auvyx['css'] ) ? null : $this->engine->compile_scoped_css( $auvyx['css'] ),
					)
				);
				foreach ( $compiled as $rule ) {
					$css .= $rule['css'];
				}
			}
			foreach ( (array) ( $node['innerBlocks'] ?? array() ) as $child ) {
				$walk( $child );
			}
		};
		$walk( $block );
		return $css;
	}

	public function enqueue(): void {
		wp_register_style( self::HANDLE, false, array(), defined( 'AUVYX_BUILDER_VERSION' ) ? AUVYX_BUILDER_VERSION : '1' );
		wp_enqueue_style( self::HANDLE );
		wp_add_inline_style( self::HANDLE, ThemeTokens::isolated_css() );
	}

	/**
	 * Preset variables currently on the site, copied into a shadow tree.
	 */
	private static function token_vars(): string {
		if ( ! function_exists( 'wp_get_global_stylesheet' ) ) {
			return '';
		}
		$css = (string) wp_get_global_stylesheet( array( 'variables' ) );
		if ( ! preg_match( '/:root\s*\{([^}]*)\}/', $css, $match ) ) {
			return '';
		}
		$keep = array();
		foreach ( explode( ';', $match[1] ) as $decl ) {
			$decl = trim( $decl );
			if ( 0 === strpos( $decl, '--wp--preset--' ) || 0 === strpos( $decl, '--wp--custom--' ) ) {
				$keep[] = $decl;
			}
		}
		return implode( ';', $keep );
	}

	/**
	 * @param mixed $presets Theme.json presets, by origin or a list.
	 * @return array<int, array<string, mixed>>
	 */
	private static function preset_list( $presets ): array {
		if ( is_array( $presets ) && isset( $presets['theme'] ) && is_array( $presets['theme'] ) ) {
			$presets = $presets['theme'];
		}
		if ( ! is_array( $presets ) ) {
			return array();
		}
		return array_values(
			array_filter(
				$presets,
				static function ( $preset ) {
					return is_array( $preset ) && isset( $preset['slug'] );
				}
			)
		);
	}
}
