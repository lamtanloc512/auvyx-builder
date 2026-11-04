<?php
/**
 * Tabs on the published page: an Auvyx section with the `auvyx-tabs` class becomes a tab list built from each child panel's
 * first heading. Loaded only on pages that have one. Without the script the panels stack with their headings.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Tabs;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Tabs implements Module {

	public const HANDLE = 'auvyx-tabs';

	public function id(): string {
		return 'tabs';
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
			AUVYX_BUILDER_URL . 'assets/tabs.js',
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
		if ( in_array( 'auvyx-tabs', explode( ' ', (string) ( $block['attrs']['className'] ?? '' ) ), true ) ) {
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}
}
