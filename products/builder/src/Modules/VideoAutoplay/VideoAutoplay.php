<?php
/**
 * Video Autoplay on the published page: an Auvyx Video with the `auvyx-video-autoplay` class (Studio: Settings → Autoplay)
 * starts muted (blocks/video/render.php) and gets video.js, which turns its sound on as soon as the browser allows it
 * and adds a sound on/off button. Loaded only on pages that have one; EzyPlatform prints the same file (FrontEnd.scripts).
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\VideoAutoplay;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class VideoAutoplay implements Module {

	public const HANDLE = 'auvyx-video-autoplay';

	public function id(): string {
		return 'video-autoplay';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block_auvyx/video', array( $this, 'render' ), 10, 2 );
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/video.js',
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
		$classes = explode( ' ', (string) ( $block['attrs']['className'] ?? '' ) );
		// A player that starts by itself, or a background video with sound: both are marked data-auvyx-autoplay.
		if ( in_array( 'auvyx-video-autoplay', $classes, true ) && false !== strpos( (string) $html, 'data-auvyx-autoplay' ) ) {
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}
}
