<?php
/**
 * The page title, per page (Studio → Post settings → Page title): hide it, or align it left, centre or right across the
 * site's content column, the same column the sections use. Stored as post meta `auvyx_title`; empty keeps the theme's own
 * title. Works with any block theme that shows the title with the core post-title block.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\PageTitle;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class PageTitle implements Module {

	public const META = 'auvyx_title';

	/** @var string[] */
	public const CHOICES = array( 'hide', 'left', 'center', 'right' );

	public function id(): string {
		return 'page-title';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_meta' ) );
		add_filter( 'render_block_core/post-title', array( $this, 'render' ), 10, 2 );
		add_action( 'wp_head', array( $this, 'hide_theme_title_css' ), 99 );
	}

	public function register_meta(): void {
		foreach ( array( 'page', 'post' ) as $type ) {
			register_post_meta(
				$type,
				self::META,
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => true,
					'sanitize_callback' => array( self::class, 'sanitize' ),
					'auth_callback'     => static fn( $allowed, $meta_key, $post_id ) => current_user_can( 'edit_post', (int) $post_id ),
				)
			);
		}
	}

	/** @param mixed $value Submitted value. */
	public static function sanitize( $value ): string {
		return in_array( $value, self::CHOICES, true ) ? (string) $value : '';
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render( $html, $block ): string {
		unset( $block );
		$id = (int) get_queried_object_id();
		// Only the title of the page being viewed, not a title inside a posts list.
		if ( $id <= 0 || ! is_singular() || (int) get_the_ID() !== $id ) {
			return (string) $html;
		}
		$choice = self::sanitize( get_post_meta( $id, self::META, true ) );
		if ( '' === $choice ) {
			return (string) $html;
		}
		if ( 'hide' === $choice ) {
			return '';
		}
		$tags = new \WP_HTML_Tag_Processor( (string) $html );
		if ( ! $tags->next_tag() ) {
			return (string) $html;
		}
		$tags->add_class( 'alignwide' );
		$tags->add_class( 'has-text-align-' . $choice );
		return $tags->get_updated_html();
	}

	/** Classic themes (Kadence, etc.) draw a hero title outside core/post-title; hide it when Studio asks. */
	public function hide_theme_title_css(): void {
		if ( ! is_singular( array( 'page', 'post' ) ) ) {
			return;
		}
		$id = (int) get_queried_object_id();
		if ( $id <= 0 || (int) get_the_ID() !== $id ) {
			return;
		}
		if ( 'hide' !== self::sanitize( get_post_meta( $id, self::META, true ) ) ) {
			return;
		}
		echo '<style id="auvyx-hide-page-title">.entry-hero.page-hero-section,.entry-hero,.entry-hero-container,.entry-header,.page-hero-section,.content-title-wrap,.kadence-page-title,.page-title{display:none!important}</style>' . "\n";
	}
}
