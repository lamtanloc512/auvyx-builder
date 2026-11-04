<?php
/**
 * Galleries on the published page: an Auvyx section with the `auvyx-gallery` class gets a small lightbox script (click an
 * image to see it large, arrows, Esc). Loaded only on pages that have one; the grid itself is plain HTML.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Gallery;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Gallery implements Module {

	public const HANDLE = 'auvyx-gallery';

	public function id(): string {
		return 'gallery';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block_auvyx/section', array( $this, 'render' ), 10, 2 );
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/gallery.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render( $html, $block ): string {
		if ( in_array( 'auvyx-gallery', explode( ' ', (string) ( $block['attrs']['className'] ?? '' ) ), true ) ) {
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}
}
