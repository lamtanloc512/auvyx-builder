<?php
/**
 * Banner sliders on the published page: a section whose Auvyx styles scroll-snap horizontally is a slider. Mark it at
 * render (saved HTML stays plain, ADR 0002) and load a small script only on pages that have one. The script adds
 * previous/next buttons and dots. Without it the slider still swipes and scrolls.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Slider;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Slider implements Module {

	public const HANDLE = 'auvyx-slider';

	public function id(): string {
		return 'slider';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block_auvyx/section', array( $this, 'render' ), 99, 2 ); // last: it wraps the section
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/slider.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
	}

	/**
	 * Whether these Auvyx styles make a horizontal scroll-snap track, on any breakpoint.
	 *
	 * @param mixed $styles The block's auvyx.styles.
	 */
	public static function is_slider( $styles ): bool {
		if ( ! is_array( $styles ) ) {
			return false;
		}
		foreach ( $styles as $states ) {
			$value = is_array( $states ) && isset( $states['default']['scroll-snap-type'] ) ? $states['default']['scroll-snap-type'] : '';
			if ( is_string( $value ) && 0 === strpos( trim( $value ), 'x' ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render( $html, $block ): string {
		if ( ! self::is_slider( $block['attrs']['auvyx']['styles'] ?? null ) ) {
			return (string) $html;
		}
		$tags = new \WP_HTML_Tag_Processor( (string) $html );
		if ( ! $tags->next_tag() ) {
			return (string) $html;
		}
		$tags->add_class( 'auvyx-slider' );
		wp_enqueue_script( self::HANDLE );
		// The wrapper that holds the arrows and dots comes with the page: the script must not move the slides into one,
		// or the hero text is painted a second time after every script (a late Largest Contentful Paint).
		// It also takes the slider's alignment, which the theme's layout applies to direct children only.
		$align = '';
		foreach ( array( 'alignfull', 'alignwide' ) as $class ) {
			if ( $tags->has_class( $class ) ) {
				$align = ' ' . $class;
			}
		}
		return '<div class="auvyx-slider-wrap' . $align . '">' . $tags->get_updated_html() . '</div>';
	}
}
