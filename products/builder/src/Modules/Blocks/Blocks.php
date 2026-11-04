<?php
/**
 * Registers shared assets and every block in blocks/ from the generated
 * manifest (one PHP include instead of reading N block.json files).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Blocks;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;

defined( 'ABSPATH' ) || exit;

final class Blocks implements Module {

	const EDITOR_HANDLE = 'auvyx-builder-editor';
	const BLOCKS_STYLE  = 'auvyx-builder-blocks';

	/** @var DesignSystem */
	private $design_system;

	public function __construct( DesignSystem $design_system ) {
		$this->design_system = $design_system;
	}

	public function id(): string {
		return 'blocks';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ), 5 );
		add_action( 'init', array( $this, 'register_blocks' ) );
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_ui' ) );
		add_filter( 'block_categories_all', array( $this, 'register_category' ) );
		add_filter( 'render_block_auvyx/image', array( $this, 'responsive_image' ), 10, 2 );
		add_filter( 'render_block_core/shortcode', array( $this, 'unknown_shortcode' ), 10, 2 );
		add_filter( 'body_class', array( self::class, 'own_colors' ) );
	}

	/**
	 * A shortcode block whose shortcode no plugin provides (a Flatsome element kept by the importer after the theme is
	 * gone) prints its raw `[tag …]` text: visitors see nothing instead. Editors still see it in Studio.
	 *
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function unknown_shortcode( $html, $block ): string {
		$source = trim( (string) ( $block['innerHTML'] ?? '' ) );
		if ( preg_match( '/^\[([a-zA-Z0-9_-]+)/', $source, $m ) && ! shortcode_exists( $m[1] ) ) {
			return '';
		}
		return (string) $html;
	}

	/**
	 * Media Library images: tag the <img> with wp-image-{id} and let core add srcset, sizes, width, height,
	 * loading and decoding (wp_filter_content_tags runs on post content and block templates).
	 * When rendered outside those contexts (e.g. a shortcode in a widget), add them here.
	 *
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function responsive_image( $html, $block ): string {
		$id = (int) ( $block['attrs']['id'] ?? 0 );
		if ( $id <= 0 || ! wp_attachment_is_image( $id ) ) {
			return (string) $html;
		}
		$tags = new \WP_HTML_Tag_Processor( (string) $html );
		if ( ! $tags->next_tag( 'img' ) ) {
			return (string) $html;
		}
		$tags->add_class( 'wp-image-' . $id );
		$html = $tags->get_updated_html();
		if ( ! doing_filter( 'the_content' ) ) {
			$html = (string) wp_filter_content_tags( $html, 'auvyx_image' );
		}
		return $html;
	}

	public function register_assets(): void {
		$asset = require AUVYX_BUILDER_DIR . 'build/editor.asset.php';

		wp_register_script(
			self::EDITOR_HANDLE,
			AUVYX_BUILDER_URL . 'build/editor.js',
			$asset['dependencies'],
			$asset['version'],
			array( 'in_footer' => false )
		);
		wp_add_inline_script(
			self::EDITOR_HANDLE,
			'window.auvyxBuilder = ' . wp_json_encode( array( 'designSystem' => $this->design_system->get() ) ) . ';',
			'before'
		);
		wp_set_script_translations( self::EDITOR_HANDLE, 'auvyx-builder', AUVYX_BUILDER_DIR . 'languages' );

		if ( file_exists( AUVYX_BUILDER_DIR . 'build/editor.css' ) ) {
			wp_register_style( self::EDITOR_HANDLE, AUVYX_BUILDER_URL . 'build/editor.css', array( 'wp-components' ), $asset['version'] );
		}
		wp_register_style( self::BLOCKS_STYLE, AUVYX_BUILDER_URL . 'assets/blocks.css', array(), AUVYX_BUILDER_VERSION );
		wp_register_script(
			'auvyx-snippet',
			AUVYX_BUILDER_URL . 'assets/snippet.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array( 'in_footer' => true )
		);
		// Lets WordPress inline it when the page's inline-CSS budget allows (fewer requests before first paint).
		wp_style_add_data( self::BLOCKS_STYLE, 'path', AUVYX_BUILDER_DIR . 'assets/blocks.css' );
		wp_add_inline_style( self::BLOCKS_STYLE, self::nav_breakpoints( $this->design_system->breakpoints() ) );
		// Auvyx buttons look like the theme's buttons (its element styles, style variation and Global Styles included).
		add_action(
			'wp_enqueue_scripts',
			static function () {
				wp_add_inline_style( self::BLOCKS_STYLE, self::theme_button_css() );
			},
			20
		);
	}

	/** Theme support: the theme draws text and background colours itself, so Auvyx's section colours stay off. */
	const OWN_COLORS = 'auvyx-builder-own-colors';

	/**
	 * `auvyx-own-colors` on the body where the theme supports OWN_COLORS (a port of a template with its own stylesheet):
	 * blocks.css then leaves the colours of sections, and of the text inside them, to the theme.
	 *
	 * @param string[] $classes Body classes.
	 * @return string[]
	 */
	public static function own_colors( $classes ): array {
		$classes = (array) $classes;
		if ( current_theme_supports( self::OWN_COLORS ) ) {
			$classes[] = 'auvyx-own-colors';
		}
		return $classes;
	}

	/**
	 * The theme's button element styles (Global Styles → Elements → Button) for Auvyx buttons, at zero specificity so a
	 * button's own Studio styles still win. Empty when the theme sets none.
	 */
	public static function theme_button_css(): string {
		if ( ! function_exists( 'wp_get_global_styles' ) || ! function_exists( 'wp_style_engine_get_styles' ) ) {
			return '';
		}
		$button = wp_get_global_styles( array( 'elements', 'button' ) );
		if ( ! is_array( $button ) || ! $button ) {
			return '';
		}
		$css   = '';
		$rules = array(
			':where(.wp-block-auvyx-button)'               => array_intersect_key( $button, array_flip( array( 'color', 'border', 'spacing', 'typography', 'shadow' ) ) ),
			':where(.wp-block-auvyx-button):hover'         => isset( $button[':hover'] ) && is_array( $button[':hover'] ) ? $button[':hover'] : array(),
			':where(.wp-block-auvyx-button):focus-visible' => isset( $button[':focus'] ) && is_array( $button[':focus'] ) ? $button[':focus'] : array(),
		);
		foreach ( $rules as $selector => $styles ) {
			if ( $styles ) {
				$out  = wp_style_engine_get_styles( $styles, array( 'selector' => $selector ) );
				$css .= (string) ( $out['css'] ?? '' );
			}
		}
		// Themes print `a:where(:not(.wp-element-button)){color:currentcolor}` (0,0,1) after us, which repaints a
		// zero-specificity button text in its surroundings' colour. (0,0,2) beats it; a button's Studio class (0,1,0) still wins.
		$text = $button['color']['text'] ?? '';
		if ( is_string( $text ) && '' !== $text ) {
			$out  = wp_style_engine_get_styles( array( 'color' => array( 'text' => $text ) ), array( 'selector' => 'body a:where(.wp-block-auvyx-button)' ) );
			$css .= (string) ( $out['css'] ?? '' );
		}
		// The theme decides how a button reacts to the pointer.
		return '' !== $css ? ':where(.wp-block-auvyx-button):hover{filter:none}' . $css : '';
	}

	/**
	 * Auvyx Navigation: below the tablet / mobile breakpoint of the design system, the links fold into the menu button.
	 *
	 * @param array<int, array<string, mixed>> $breakpoints Design system breakpoints.
	 */
	public static function nav_breakpoints( array $breakpoints ): string {
		$css = '';
		foreach ( array( 'tablet', 'mobile' ) as $id ) {
			foreach ( $breakpoints as $bp ) {
				if ( ( $bp['id'] ?? '' ) === $id && isset( $bp['maxWidth'] ) ) {
					$css .= sprintf( '@media (max-width:%1$dpx){.auvyx-nav--toggle-%2$s .auvyx-nav__list{display:none}.auvyx-nav--toggle-%2$s .auvyx-nav__menu{display:block}}', (int) $bp['maxWidth'], $id );
				}
			}
		}
		// "tablet" also folds on mobile.
		foreach ( $breakpoints as $bp ) {
			if ( 'mobile' === ( $bp['id'] ?? '' ) && isset( $bp['maxWidth'] ) ) {
				$css .= sprintf( '@media (max-width:%1$dpx){.auvyx-nav--toggle-tablet .auvyx-nav__list{display:none}.auvyx-nav--toggle-tablet .auvyx-nav__menu{display:block}}', (int) $bp['maxWidth'] );
			}
		}
		return $css;
	}

	public function register_blocks(): void {
		$blocks_dir = AUVYX_BUILDER_DIR . 'blocks';
		$manifest   = AUVYX_BUILDER_DIR . 'generated/blocks-manifest.php';

		if ( function_exists( 'wp_register_block_types_from_metadata_collection' ) ) {
			wp_register_block_types_from_metadata_collection( $blocks_dir, $manifest );
			return;
		}
		wp_register_block_metadata_collection( $blocks_dir, $manifest );
		foreach ( array_keys( require $manifest ) as $block_dir ) {
			register_block_type( $blocks_dir . '/' . $block_dir );
		}
	}

	public function enqueue_editor_ui(): void {
		if ( wp_style_is( self::EDITOR_HANDLE, 'registered' ) ) {
			wp_enqueue_style( self::EDITOR_HANDLE );
		}
	}

	/**
	 * @param array<int, array<string, mixed>> $categories Block categories.
	 * @return array<int, array<string, mixed>>
	 */
	public function register_category( $categories ): array {
		array_unshift(
			$categories,
			array(
				'slug'  => 'auvyx-builder',
				'title' => __( 'Auvyx Builder', 'auvyx-builder' ),
			)
		);
		return $categories;
	}
}
