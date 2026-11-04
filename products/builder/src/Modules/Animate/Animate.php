<?php
/**
 * Scroll entrance animations on the published page (Flatsome's "Animate"): an Auvyx block with a `auvyx-animate-<name>`
 * class plays its entrance once when it scrolls into view. The script loads only on pages that use one.
 * Block themes render the template before wp_head, so the head can mark <html> early and nothing flashes; without
 * that mark (or with reduced motion, or no script) elements simply show. The saved markup stays plain HTML.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Animate;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Animate implements Module {

	public const HANDLE = 'auvyx-animate';

	/** @var bool */
	private $used = false;

	public function id(): string {
		return 'animate';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block', array( $this, 'render' ), 10, 2 );
		add_action( 'wp_head', array( $this, 'head' ), 2 );
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/animate.js',
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
		$name = (string) ( $block['blockName'] ?? '' );
		if ( 0 === strpos( $name, 'auvyx/' ) && false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'auvyx-animate-' ) ) {
			$this->used = true;
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}

	/** Hide animated elements until seen, from the first paint; undone if the script never arrives. */
	public function head(): void {
		if ( ! $this->used ) {
			return;
		}
		wp_print_inline_script_tag(
			'if(!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("auvyx-anim");setTimeout(function(){if(!window.auvyxAnimate)document.documentElement.classList.remove("auvyx-anim")},3000)}'
		);
	}
}
