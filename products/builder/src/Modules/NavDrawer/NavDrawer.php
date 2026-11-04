<?php
/**
 * Menu drawers (NavDrawer in the Studio): an Auvyx Navigation whose class names a drawer (`auvyx-drawer-left|right|full|sheet`)
 * opens its menu button as that drawer. blocks.css draws it; this loads drawer.js (closing on the backdrop, Escape and
 * a link, a still page behind, folding submenus) only on pages that have one. The saved markup stays the navigation's.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\NavDrawer;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class NavDrawer implements Module {

	public const HANDLE = 'auvyx-drawer';

	public function id(): string {
		return 'nav-drawer';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block_auvyx/nav', array( $this, 'render' ), 10, 2 );
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/drawer.js',
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
		if ( 1 === preg_match( '/(^|\s)(auvyx-drawer-(left|right|full|sheet)|auvyx-nav-dept)(\s|$)/', (string) ( $block['attrs']['className'] ?? '' ) ) ) {
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}
}
