<?php
/**
 * Load more and infinite scroll for paginated lists (Auvyx Posts loop with `more`, and Auvyx Woo's shop catalog): the page
 * always prints its page numbers, so it works without JavaScript and every page stays a plain, cacheable URL. A small
 * script (loaded only where a list asks for it) hides the numbers, fetches the next page's HTML and appends its items.
 *
 * A list opts in with data attributes on its wrapper:
 * `data-auvyx-more` ("button" | "scroll"), `data-auvyx-more-key` (the same on every page of that list),
 * `data-auvyx-more-list` (selector of the items' parent inside the wrapper; the wrapper itself when absent),
 * `data-auvyx-more-nav` (selector of the page numbers inside the wrapper; the wrapper's next sibling when absent).
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\LoopMore;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class LoopMore implements Module {

	public const HANDLE = 'auvyx-loop-more';

	/** Modes a list can use besides page numbers. */
	public const MODES = array( 'button', 'scroll' );

	public function id(): string {
		return 'loop-more';
	}

	public function requires(): array {
		return array( 'wp' => '6.5' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/loop-more.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
	}

	/**
	 * Wrapper attributes for a list that loads more, and the script on this page. Empty for page numbers.
	 *
	 * @param string $mode "button", "scroll" or anything else (page numbers).
	 * @param string $key  Identifies the list on every page (letters, digits, `-`, `_`).
	 * @return array<string, string>
	 */
	public static function attributes( string $mode, string $key ): array {
		if ( ! in_array( $mode, self::MODES, true ) ) {
			return array();
		}
		if ( ! wp_script_is( self::HANDLE, 'registered' ) ) {
			( new self() )->register_assets();
		}
		wp_enqueue_script( self::HANDLE );
		return array(
			'data-auvyx-more'         => $mode,
			'data-auvyx-more-key'     => (string) preg_replace( '/[^A-Za-z0-9_-]/', '', $key ),
			'data-auvyx-more-label'   => __( 'Load more', 'auvyx-builder' ),
			'data-auvyx-more-loading' => __( 'Loading…', 'auvyx-builder' ),
			/* translators: %d: number of items just added to the list */
			'data-auvyx-more-done'    => __( '%d more items shown', 'auvyx-builder' ),
		);
	}
}
