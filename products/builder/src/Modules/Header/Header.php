<?php
/**
 * Header options on the published page (Studio: select the header → Sticky / Over hero): the header part's root Auvyx
 * section carries `auvyx-header-sticky`, `auvyx-header-shrink` or `auvyx-header-overlay`; blocks.css applies them to the
 * theme's template-part wrapper and a tiny script marks it `is-stuck` once the page scrolls. Loaded only where used.
 *
 * Header and footer builders (docs/header-builder.md) keep their layout in `auvyx-sf-header-*` / `auvyx-sf-footer-*` marker classes
 * (shared/storefront/anatomy.json): the saved block keeps them (the builder reads them back), visitor HTML never carries them.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Header;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Header implements Module {

	public const HANDLE = 'auvyx-header';

	public function id(): string {
		return 'header';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block_auvyx/section', array( $this, 'render' ), 10, 2 );
		add_filter( 'render_block', array( $this, 'strip_markers' ), 20, 2 );
	}

	/** @var array<string, true>|null */
	private $markers = null;

	/**
	 * Drops the builders' marker classes from the block's own tag (every block: a platform block in a slot carries one too).
	 *
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function strip_markers( $html, $block ): string {
		$html = (string) $html;
		if ( false === strpos( $html, 'auvyx-sf-header-' ) && false === strpos( $html, 'auvyx-sf-footer-' ) ) {
			return $html;
		}
		unset( $block );
		if ( null === $this->markers ) {
			$this->markers = array_fill_keys( \Auvyx\Builder\Plugin::shared_data( 'anatomy-markers' ), true );
		}
		$tags = new \WP_HTML_Tag_Processor( $html );
		if ( ! $tags->next_tag() ) {
			return $html;
		}
		$changed = false;
		foreach ( iterator_to_array( $tags->class_list(), false ) as $class ) {
			if ( isset( $this->markers[ $class ] ) ) {
				$tags->remove_class( $class );
				$changed = true;
			}
		}
		return $changed ? $tags->get_updated_html() : $html;
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/header.js',
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
		if ( array_intersect( array( 'auvyx-header-sticky', 'auvyx-header-overlay' ), $classes ) ) {
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}
}
