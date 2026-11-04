<?php
/**
 * The blank page template: nothing but the page's own content, full width, no header, footer or title (docs/mcp.md).
 * A page made from scratch (by a person or an AI through MCP) starts here and adds the site's header and footer
 * itself when it wants them (template part blocks), or switches to a template that has them.
 *
 * Registered by the plugin, so it is offered whatever the block theme.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\BlankPage;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class BlankPage implements Module {

	/** The template's slug: what a page's `template` field holds. */
	public const SLUG = 'auvyx-blank';

	/** The class on the template's content: its top-level blocks stack flush, as sections on a canvas do. */
	public const CLASS_NAME = 'auvyx-blank';

	public function id(): string {
		return 'blank-page';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' ); // register_block_template
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_template' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'styles' ) );
	}

	public function register_template(): void {
		if ( ! function_exists( 'register_block_template' ) || ! wp_is_block_theme() ) {
			return;
		}
		register_block_template(
			'auvyx-builder//' . self::SLUG,
			array(
				'title'       => __( 'Blank (no header, footer or title)', 'auvyx-builder' ),
				'description' => __( 'Only the page content, full width. Add the site header and footer as blocks when the page needs them.', 'auvyx-builder' ),
				'content'     => self::content(),
				'post_types'  => array( 'page', 'post' ),
			)
		);
	}

	public static function content(): string {
		$attrs = array(
			'tagName'   => 'main',
			'align'     => 'full',
			'className' => self::CLASS_NAME,
			'layout'    => array( 'type' => 'default' ),
			'style'     => array(
				'spacing' => array(
					'margin' => array(
						'top'    => '0',
						'bottom' => '0',
					),
				),
			),
		);
		return '<!-- wp:post-content ' . wp_json_encode( $attrs ) . ' /-->';
	}

	public function styles(): void {
		if ( ! is_singular() || self::SLUG !== get_page_template_slug() ) {
			return;
		}
		wp_register_style( 'auvyx-blank-page', false, array(), AUVYX_BUILDER_VERSION );
		wp_enqueue_style( 'auvyx-blank-page' );
		wp_add_inline_style( 'auvyx-blank-page', '.wp-site-blocks{padding:0}.wp-site-blocks>*,.auvyx-blank>*{margin-block:0}.auvyx-blank{max-width:none}' );
	}
}
