<?php
/**
 * Sandboxed custom code (a auvyx/section whose auvyx.sandbox holds HTML, CSS and a script).
 * The saved page element is empty. On render the source becomes an iframe srcdoc, escaped,
 * with sandbox="allow-scripts" and a CSP that blocks the network unless an https origin was allowlisted.
 * Only a user with unfiltered_html keeps auvyx.sandbox on save (CustomCss).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Sandbox;

use Auvyx\Builder\Module;
use Auvyx\Builder\Plugin;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;

defined( 'ABSPATH' ) || exit;

final class SandboxCode implements Module {

	public function id(): string {
		return 'sandbox-code';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_filter( 'render_block_auvyx/section', array( $this, 'render' ), 20, 2 );
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 * @return string
	 */
	public function render( $html, $block ): string {
		$html    = (string) $html;
		$sandbox = $block['attrs']['auvyx']['sandbox'] ?? null;
		if ( '' === $html || ! is_array( $sandbox ) ) {
			return $html;
		}
		$tokens = array();
		$design = Plugin::instance()->module( 'design-system' );
		if ( $design instanceof DesignSystem ) {
			$got = $design->get();
			if ( isset( $got['tokens'] ) && is_array( $got['tokens'] ) ) {
				$tokens = $got['tokens'];
			}
		}
		$frame = SandboxFrame::iframe( $sandbox, $tokens );
		$end   = strrpos( $html, '</' );
		if ( false === $end ) {
			return $html;
		}
		$open = strpos( $html, '>' );
		if ( false === $open || $open >= $end ) {
			return $html;
		}
		return substr( $html, 0, $open + 1 ) . $frame . substr( $html, $end );
	}
}
