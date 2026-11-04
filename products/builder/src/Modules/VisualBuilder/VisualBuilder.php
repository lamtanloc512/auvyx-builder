<?php
/**
 * Full-screen visual builder (ADR 0018).
 *
 * - post.php?post=ID&action=auvyx-builder prints a standalone page that mounts the builder app;
 * - the canvas is the real frontend page (theme header/footer, global styles) loaded with
 *   ?auvyx-canvas=<nonce>, where the post content is replaced by an empty root the app renders into;
 * - "Edit with Auvyx Builder" links in list tables and the admin bar.
 *
 * Content is still saved as native blocks through the REST API.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\VisualBuilder;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Components\Components;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;

defined( 'ABSPATH' ) || exit;

final class VisualBuilder implements Module {

	const ACTION       = 'auvyx-builder';
	const HANDLE       = 'auvyx-visual-builder';
	const CANVAS_PARAM = 'auvyx-canvas';
	const CANVAS_ROOT  = '<!--auvyx-canvas-root-->';

	/** @var DesignSystem */
	private $design_system;

	/** @var Components */
	private $components;

	/** @var bool */
	private $canvas = false;

	/** @var bool */
	private $canvas_root_printed = false;

	public function __construct( DesignSystem $design_system, Components $components ) {
		$this->design_system = $design_system;
		$this->components    = $components;
	}

	public function id(): string {
		return 'visual-builder';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ), 6 );
		add_action( 'post_action_' . self::ACTION, array( $this, 'render_builder' ) );
		// Entry links now point to Auvyx Studio (Modules/Studio); this React builder stays reachable by URL until removal.

		// Canvas mode. Cheap early checks; the nonce and capability are verified on template_redirect.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET[ self::CANVAS_PARAM ] ) ) {
			add_filter( 'show_admin_bar', '__return_false' );
			// The web canvas's frame keeps the visitor's sheets (per block, as the page loads them); new blocks bring theirs.
			if ( ! \Auvyx\Builder\Modules\CanvasWeb\CanvasWeb::is_frame() ) {
				add_filter( 'should_load_separate_core_block_assets', '__return_false' );
			}
			add_action( 'template_redirect', array( $this, 'start_canvas' ), 0 );
		}
	}

	/**
	 * @return string[]
	 */
	public static function post_types(): array {
		/**
		 * Post types editable in the visual builder. wp_block = components (synced patterns).
		 *
		 * @param string[] $post_types
		 */
		return (array) apply_filters( 'auvyx_builder_post_types', array( 'page', 'post', 'wp_block' ) );
	}

	public static function url( int $post_id ): string {
		return admin_url( 'post.php?post=' . $post_id . '&action=' . self::ACTION );
	}

	public function register_assets(): void {
		$asset_file = AUVYX_BUILDER_DIR . 'build/visual-builder.asset.php';
		if ( ! file_exists( $asset_file ) ) {
			return;
		}
		$asset = require $asset_file;
		wp_register_script( self::HANDLE, AUVYX_BUILDER_URL . 'build/visual-builder.js', $asset['dependencies'], $asset['version'], array( 'in_footer' => true ) );
		wp_set_script_translations( self::HANDLE, 'auvyx-builder', AUVYX_BUILDER_DIR . 'languages' );
		wp_register_style( self::HANDLE, AUVYX_BUILDER_URL . 'build/visual-builder.css', array( 'wp-components' ), $asset['version'] );
	}

	/**
	 * post.php?post=ID&action=auvyx-builder
	 *
	 * @param int $post_id Post ID.
	 */
	public function render_builder( $post_id ): void {
		$post = get_post( (int) $post_id );
		if ( ! $post || ! in_array( $post->post_type, self::post_types(), true ) || ! current_user_can( 'edit_post', $post->ID ) ) {
			wp_die( esc_html__( 'You cannot edit this item with Auvyx Builder.', 'auvyx-builder' ), 403 );
		}
		if ( ! wp_script_is( self::HANDLE, 'registered' ) ) {
			wp_die( esc_html__( 'Auvyx Builder is not built.', 'auvyx-builder' ) );
		}

		$canvas_host = self::canvas_host( $post );
		$type        = get_post_type_object( $post->post_type );
		$config      = array(
			'postId'           => $post->ID,
			'postType'         => $post->post_type,
			'restBase'         => $type && $type->rest_base ? $type->rest_base : $post->post_type,
			'isComponent'      => 'wp_block' === $post->post_type,
			'title'            => get_the_title( $post ),
			'content'          => $post->post_content,
			'status'           => $post->post_status,
			'canvasUrl'        => $canvas_host ? self::canvas_url( $post ) : '',
			'viewUrl'          => 'wp_block' === $post->post_type ? '' : self::view_url( $post ),
			'blockEditorUrl'   => (string) get_edit_post_link( $post->ID, 'raw' ),
			'exitUrl'          => admin_url( 'edit.php?post_type=' . $post->post_type ),
			'builderUrl'       => admin_url( 'post.php?action=' . self::ACTION . '&post=' ),
			'palette'          => wp_get_global_settings( array( 'color', 'palette' ) ),
			'components'       => $this->components->all_for_builder(),
			'locationOptions'  => $this->components->location_options(),
			'canEditLocations' => current_user_can( 'edit_theme_options' ),
			'patterns'         => $this->patterns(),
		);

		wp_enqueue_script( self::HANDLE );
		wp_enqueue_style( self::HANDLE );
		wp_add_inline_script(
			self::HANDLE,
			'window.auvyxBuilder = ' . wp_json_encode( array( 'designSystem' => $this->design_system->get() ) ) . ';' .
			'window.auvyxVisualBuilder = ' . wp_json_encode( $config ) . ';',
			'before'
		);
		wp_add_inline_script( 'wp-blocks', 'wp.blocks.setCategories(' . wp_json_encode( get_block_categories( $post ) ) . ');' );

		nocache_headers();
		header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );
		?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title><?php echo esc_html( sprintf( /* translators: %s: post title */ __( 'Auvyx Builder: %s', 'auvyx-builder' ), get_the_title( $post ) ) ); ?></title>
		<?php
		wp_print_styles();
		print_head_scripts();
		?>
</head>
<body class="auvyx-vb-body">
	<div id="auvyx-visual-builder"></div>
		<?php
		/** Fires before footer scripts on the builder page (dev tooling, add-ons). */
		do_action( 'auvyx_builder_visual_builder_footer' );
		print_footer_scripts();
		?>
</body>
</html>
		<?php
		exit;
	}

	/** Canvas URL for a post (shared with Auvyx Studio): the real frontend page in canvas mode. */
	public static function canvas_url( \WP_Post $post ): string {
		$host = self::canvas_host( $post );
		$url  = $host ? add_query_arg( self::CANVAS_PARAM, wp_create_nonce( self::CANVAS_PARAM ), self::view_url( $host ) ) : '';
		// Components and patterns are pieces, not pages: their canvas leaves out the site's header and footer.
		return '' !== $url && 'wp_block' === $post->post_type ? add_query_arg( self::BARE_PARAM, '1', $url ) : $url;
	}

	/** Canvas without the site's header and footer (components, patterns). */
	const BARE_PARAM = 'auvyx-bare';

	/** The page whose frontend hosts the canvas: the post itself, or (components) the front page. */
	private static function canvas_host( \WP_Post $post ): ?\WP_Post {
		if ( is_post_type_viewable( $post->post_type ) ) {
			return $post;
		}
		$front = (int) get_option( 'page_on_front' );
		if ( $front && get_post( $front ) ) {
			return get_post( $front );
		}
		$pages = get_posts(
			array(
				'post_type'      => 'page',
				'post_status'    => 'publish',
				'posts_per_page' => 1,
			)
		);
		return $pages ? $pages[0] : null;
	}

	private static function view_url( \WP_Post $post ): string {
		return 'publish' === $post->post_status ? (string) get_permalink( $post ) : (string) get_preview_post_link( $post );
	}

	/**
	 * @return array<int, array{name: string, title: string, content: string}>
	 */
	private function patterns(): array {
		$patterns = array();
		foreach ( \WP_Block_Patterns_Registry::get_instance()->get_all_registered() as $pattern ) {
			if ( in_array( 'auvyx-builder', $pattern['categories'] ?? array(), true ) ) {
				$patterns[] = array(
					'name'    => $pattern['name'],
					'title'   => $pattern['title'],
					'content' => $pattern['content'],
				);
			}
		}
		return $patterns;
	}

	public function start_canvas(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$nonce = sanitize_text_field( wp_unslash( $_GET[ self::CANVAS_PARAM ] ?? '' ) );
		$id    = get_queried_object_id();
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- the canvas nonce is checked right below.
		$editing_part = isset( $_GET[ \Auvyx\Builder\Modules\Studio\Parts::PARAM ] ) && current_user_can( 'edit_theme_options' );
		// A part may be edited on any page that shows it (the shop has no post of its own); a post's content only on it.
		if ( ! wp_verify_nonce( $nonce, self::CANVAS_PARAM ) || ( ! $editing_part && ( ! $id || ! current_user_can( 'edit_post', $id ) ) ) ) {
			return;
		}
		$this->canvas = true;
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- the canvas nonce is verified above.
		$part = sanitize_title( wp_unslash( $_GET[ \Auvyx\Builder\Modules\Studio\Parts::PARAM ] ?? '' ) );
		if ( '' !== $part ) {
			// Editing a template part: the page keeps its content, the part becomes the Studio root.
			if ( current_user_can( 'edit_theme_options' ) ) {
				\Auvyx\Builder\Modules\Studio\Parts::replace_in_canvas( $part, self::CANVAS_ROOT );
			}
		} else {
			add_filter( 'the_content', array( $this, 'canvas_content' ), PHP_INT_MAX );
		}
		if ( ! \Auvyx\Builder\Modules\CanvasWeb\CanvasWeb::is_frame() ) {
			add_action(
				'wp_enqueue_scripts',
				static function () {
					wp_enqueue_style( 'auvyx-builder-blocks' );
				}
			);
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- the canvas nonce is verified above.
		if ( ! empty( $_GET[ self::BARE_PARAM ] ) ) {
			add_filter(
				'render_block_core/template-part',
				static function ( $html, $block ) {
					$attrs = (array) ( $block['attrs'] ?? array() );
					$slug  = (string) ( $attrs['slug'] ?? '' );
					$area  = in_array( $attrs['tagName'] ?? '', array( 'header', 'footer' ), true ) || preg_match( '/^(header|footer)\b/', $slug );
					return $area ? '' : $html;
				},
				10,
				2
			);
		}
	}

	/**
	 * Replaces the main post content with an empty marker; the builder renders the
	 * edited block tree next to it, inside the theme's real content wrapper.
	 *
	 * @param string $content Rendered content.
	 */
	public function canvas_content( $content ): string {
		// An excerpt (a bound field, a meta description) runs the_content too and strips the marker: keep it for the shown content.
		if ( $this->canvas && ! $this->canvas_root_printed && get_the_ID() === get_queried_object_id() && ! doing_filter( 'get_the_excerpt' ) ) {
			$this->canvas_root_printed = true;
			/**
			 * The canvas root in the page's content: what shows around it, as on the page (components placed before or
			 * after the content).
			 *
			 * @param string $root The root marker.
			 */
			return (string) apply_filters( 'auvyx_builder_canvas_root', self::CANVAS_ROOT );
		}
		return (string) $content;
	}

	/**
	 * @param array<string, string> $actions Row actions.
	 * @param \WP_Post              $post    Post.
	 * @return array<string, string>
	 */
	public function row_action( $actions, $post ): array {
		if ( $post instanceof \WP_Post && in_array( $post->post_type, self::post_types(), true ) && current_user_can( 'edit_post', $post->ID ) ) {
			$actions['auvyx-builder'] = sprintf( '<a href="%s">%s</a>', esc_url( self::url( $post->ID ) ), esc_html__( 'Edit with Auvyx Builder', 'auvyx-builder' ) );
		}
		return (array) $actions;
	}

	/**
	 * @param \WP_Admin_Bar $bar Admin bar.
	 */
	public function admin_bar( $bar ): void {
		if ( is_admin() || ! is_singular( self::post_types() ) || ! current_user_can( 'edit_post', get_queried_object_id() ) ) {
			return;
		}
		$bar->add_node(
			array(
				'id'    => 'auvyx-builder',
				'title' => esc_html__( 'Edit with Auvyx Builder', 'auvyx-builder' ),
				'href'  => self::url( get_queried_object_id() ),
			)
		);
	}
}
