<?php
/**
 * Custom CSS (`auvyx.css`) and code elements (`auvyx.code`): free CSS for one element, scoped to it by the style engine
 * (compile_scoped_css), and an element's own HTML and script (CodeElement).
 *
 * CSS with selectors and url() can read a page (attribute selectors that load an image per letter), so only users
 * who may write unrestricted HTML keep it, as with the Custom HTML block and the Customizer's Additional CSS: for
 * anyone else it is taken out of what they save. Rendering is the Styles module's.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\CustomCss;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class CustomCss implements Module {

	public function id(): string {
		return 'custom-css';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_filter( 'wp_insert_post_data', array( $this, 'guard' ), 10, 1 );
	}

	/** Whether the current user may save an element's own CSS. */
	public static function allowed(): bool {
		return current_user_can( 'unfiltered_html' );
	}

	/**
	 * Takes `auvyx.css` out of what a user without the right saves. Code that saves without a user (imports, WP-CLI) is trusted.
	 *
	 * @param array<string, mixed> $data Slashed post data.
	 * @return array<string, mixed>
	 */
	public function guard( $data ) {
		if ( ! is_array( $data ) || ! is_user_logged_in() || self::allowed() ) {
			return $data;
		}
		$content = wp_unslash( (string) ( $data['post_content'] ?? '' ) );
		if ( ( false === strpos( $content, '"css"' ) && false === strpos( $content, '"code"' ) && false === strpos( $content, '"sandbox"' ) ) || ! has_blocks( $content ) ) {
			return $data;
		}
		$changed = false;
		$blocks  = self::strip( parse_blocks( $content ), $changed );
		if ( $changed ) {
			$data['post_content'] = wp_slash( serialize_blocks( $blocks ) );
		}
		return $data;
	}

	/**
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @param bool                             $changed Set when something was taken out.
	 * @return array<int, array<string, mixed>>
	 */
	private static function strip( array $blocks, bool &$changed ): array {
		foreach ( $blocks as $i => $block ) {
			foreach ( array( 'css', 'code', 'sandbox' ) as $key ) {
				if ( isset( $block['attrs']['auvyx'][ $key ] ) ) {
					unset( $blocks[ $i ]['attrs']['auvyx'][ $key ] );
					$changed = true;
				}
			}
			if ( ! empty( $block['innerBlocks'] ) ) {
				$blocks[ $i ]['innerBlocks'] = self::strip( $block['innerBlocks'], $changed );
			}
		}
		return $blocks;
	}
}
