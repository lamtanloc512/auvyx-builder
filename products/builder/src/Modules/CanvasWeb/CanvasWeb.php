<?php
/**
 * Auvyx Studio's web canvas on WordPress (docs/canvas-renderer.md, "WordPress"): the canvas paints what the site serves.
 *
 * - Frame: the real page in canvas mode with `auvyx-canvas-frame=web`; the document is rendered as for a visitor (its
 *   sheets, rules and scripts are enqueued) and replaced by the canvas root; `#auvyx-page-css` is printed where the page's
 *   own rules print.
 * - `POST auvyx/v1/canvas/render`: the Studio's block markup rendered as the page renders it, each element's first tag
 *   marked with its Studio id (`data-auvyx-id`) and its position (`data-auvyx-path`), with the rules and sheets it needs.
 * - `?auvyx-ids=1` (administrators, never cached): the public page with positions on its elements, for the parity probe.
 *
 * The marks exist only in these answers: saved content never carries them.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\CanvasWeb;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Studio\Parts;
use Auvyx\Builder\Modules\Studio\Studio;
use Auvyx\Builder\Modules\Styles\Styles;
use Auvyx\Builder\Modules\VisualBuilder\VisualBuilder;

defined( 'ABSPATH' ) || exit;

final class CanvasWeb implements Module {

	/** Canvas frame parameter (with the `auvyx-canvas` nonce): the web canvas's frame. */
	const FRAME_PARAM = 'auvyx-canvas-frame';

	/** Public page parameter: element positions for the parity probe. */
	const IDS_PARAM = 'auvyx-ids';

	/** Most elements one render marks. */
	const MAX_ELEMENTS = 5000;

	/** Largest markup one render accepts (bytes). */
	const MAX_MARKUP = 524288;

	/** Ids already marked in this request: a loop's repeats are marked as clones. @var array<string, true> */
	private $seen = array();

	/** Attribute that carries an element's marks through one render (never saved). */
	const ATTR = 'auvyxCanvas';

	public function id(): string {
		return 'canvas-web';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
		add_filter( 'render_block', array( $this, 'mark' ), 1000, 2 );
		// Cheap early checks; capability (and the canvas nonce) are verified on template_redirect.
		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET[ self::IDS_PARAM ] ) ) {
			add_filter( 'show_admin_bar', '__return_false' );
			add_action( 'template_redirect', array( $this, 'start_web' ), 0 );
		}
		if ( isset( $_GET[ self::FRAME_PARAM ], $_GET[ VisualBuilder::CANVAS_PARAM ] ) ) {
			add_action( 'template_redirect', array( $this, 'start_frame' ), 0 );
		}
		// phpcs:enable WordPress.Security.NonceVerification.Recommended
	}

	/** Whether this request is the web canvas's frame (the canvas nonce is checked by VisualBuilder::start_canvas too). */
	public static function is_frame(): bool {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence only; the nonce is verified where it matters.
		return isset( $_GET[ self::FRAME_PARAM ] );
	}

	// ---- frame ---------------------------------------------------------------------------------------------------

	public function start_frame(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- the nonce itself is verified here.
		$nonce = sanitize_text_field( wp_unslash( $_GET[ VisualBuilder::CANVAS_PARAM ] ?? '' ) );
		if ( ! wp_verify_nonce( $nonce, VisualBuilder::CANVAS_PARAM ) || ! current_user_can( 'edit_posts' ) ) {
			return;
		}
		nocache_headers();
		// Right after the head's styles (wp_print_styles runs at 8): where `auvyx-builder-styles` prints a page's rules.
		add_action(
			'wp_head',
			static function () {
				echo '<style id="auvyx-page-css" data-scope=""></style>' . "\n";
			},
			9
		);
	}

	// ---- web hook (parity) -------------------------------------------------------------------------------------------

	public function start_web(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		nocache_headers();
		// The shown post's content (before do_blocks at 9), and the template parts (from the database or the theme).
		add_filter(
			'the_content',
			static function ( $content ) {
				return get_the_ID() === get_queried_object_id() && ! doing_filter( 'get_the_excerpt' ) ? self::annotate( (string) $content, 'content' ) : $content;
			},
			8
		);
		add_filter(
			'the_posts',
			static function ( $posts ) {
				return is_array( $posts ) ? array_map(
					static function ( $post ) {
						if ( ! $post instanceof \WP_Post || 'wp_template_part' !== $post->post_type ) {
							return $post;
						}
						$copy               = clone $post;
						$copy->post_content = self::annotate( (string) $post->post_content, sanitize_title( $post->post_name ) );
						return $copy;
					},
					$posts
				) : $posts;
			}
		);
		add_filter(
			'get_block_file_template',
			static function ( $template ) {
				if ( $template instanceof \WP_Block_Template && 'wp_template_part' === $template->type && is_string( $template->content ) ) {
					$template          = clone $template;
					$template->content = self::annotate( $template->content, sanitize_title( $template->slug ) );
				}
				return $template;
			}
		);
	}

	// ---- marking -------------------------------------------------------------------------------------------------------

	/**
	 * Block markup with each Studio element's marks in its attributes: in pre-order, into Studio containers only
	 * (Studio::CONTAINERS: their inner blocks are the Studio's children), the walk of Studio::tree and the Studio's own.
	 * Positions only (`ids` null) on the parity page; the Studio's ids and paths on the canvas.
	 *
	 * @param string                  $markup Block markup.
	 * @param string                  $prefix What the document is on the page (`content`, a part's slug).
	 * @param array<int, string>|null $ids    Studio ids in pre-order, or null.
	 * @param array<int, string>|null $paths  Studio paths, as many as ids.
	 */
	public static function annotate( string $markup, string $prefix, ?array $ids = null, ?array $paths = null ): string {
		if ( '' === $prefix || ! has_blocks( $markup ) ) {
			return $markup;
		}
		$blocks = parse_blocks( $markup );
		$next   = 0;
		$top    = 0;
		foreach ( $blocks as &$block ) {
			if ( self::counts( $block ) ) {
				self::walk( $block, $prefix . '/' . $top, $ids, $paths, $next );
				++$top;
			}
		}
		unset( $block );
		return serialize_blocks( $blocks );
	}

	/**
	 * Whether a parsed block is a Studio element: a block, or a classic chunk with content (Studio::tree).
	 *
	 * @param array<string, mixed> $block Parsed block.
	 */
	private static function counts( array $block ): bool {
		return null !== ( $block['blockName'] ?? null ) || '' !== trim( (string) ( $block['innerHTML'] ?? '' ) );
	}

	/**
	 * @param array<string, mixed>    $block Parsed block (changed in place).
	 * @param string                  $path  Its position.
	 * @param array<int, string>|null $ids   Studio ids.
	 * @param array<int, string>|null $paths Studio paths.
	 * @param int                     $next  The next Studio element (changed in place).
	 */
	private static function walk( array &$block, string $path, ?array $ids, ?array $paths, int &$next ): void {
		if ( null !== $ids ) {
			if ( $next >= count( $ids ) ) {
				return;
			}
			$mark = array(
				'id'   => $ids[ $next ],
				'path' => (string) $paths[ $next ],
			);
			++$next;
		} else {
			$mark = array(
				'id'   => '',
				'path' => $path,
			);
		}
		// A classic chunk has no comment to carry its marks: drawn, not selectable.
		if ( null !== ( $block['blockName'] ?? null ) ) {
			$block['attrs']               = is_array( $block['attrs'] ?? null ) ? $block['attrs'] : array();
			$block['attrs'][ self::ATTR ] = $mark;
		}
		if ( ! in_array( $block['blockName'] ?? '', Studio::CONTAINERS, true ) || empty( $block['innerBlocks'] ) ) {
			return;
		}
		$i = 0;
		foreach ( $block['innerBlocks'] as &$child ) {
			if ( is_array( $child ) && self::counts( $child ) ) {
				self::walk( $child, $path . '.' . $i, $ids, $paths, $next );
				++$i;
			}
		}
		unset( $child );
	}

	/**
	 * Puts the marks on a marked block's first tag (a slider's section inside its wrapper gets `data-auvyx-part`).
	 *
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function mark( $html, $block ): string {
		$html = (string) $html;
		$mark = $block['attrs'][ self::ATTR ] ?? null;
		if ( ! is_array( $mark ) || '' === $html ) {
			return $html;
		}
		$id   = (string) ( $mark['id'] ?? '' );
		$path = (string) ( $mark['path'] ?? '' );
		$key  = '' === $id ? 'path:' . $path : $id;
		$tags = new \WP_HTML_Tag_Processor( $html );
		if ( ! $tags->next_tag() ) {
			return $html;
		}
		if ( isset( $this->seen[ $key ] ) ) {
			// A loop's repeated item: drawn by its template, selected through it.
			if ( '' !== $id ) {
				$tags->set_attribute( 'data-auvyx-clone', $id );
			}
			return $tags->get_updated_html();
		}
		$this->seen[ $key ] = true;
		if ( '' !== $id ) {
			$tags->set_attribute( 'data-auvyx-id', $id );
		}
		$tags->set_attribute( 'data-auvyx-path', $path );
		if ( '' !== $id && $tags->has_class( 'auvyx-slider-wrap' ) && $tags->next_tag() ) {
			$tags->set_attribute( 'data-auvyx-part', $id );
		}
		return $tags->get_updated_html();
	}

	// ---- render endpoint ---------------------------------------------------------------------------------------------

	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			'/canvas/render',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_render' ),
				'permission_callback' => static function ( \WP_REST_Request $request ) {
					$post = get_post( (int) $request->get_param( 'post' ) );
					if ( ! $post || ! current_user_can( 'edit_post', $post->ID ) ) {
						return false;
					}
					return 'wp_template_part' !== $post->post_type || current_user_can( 'edit_theme_options' );
				},
				'args'                => array(
					'post'   => array(
						'type'     => 'integer',
						'required' => true,
					),
					'markup' => array(
						'type'     => 'string',
						'required' => true,
					),
					'ids'    => array(
						'type'     => 'array',
						'items'    => array( 'type' => 'string' ),
						'required' => true,
					),
					'paths'  => array(
						'type'     => 'array',
						'items'    => array( 'type' => 'string' ),
						'required' => true,
					),
				),
			)
		);
	}

	/**
	 * Studio ids and paths, both valid and as many: ids are the Studio's (letters, digits, `_ ~ - . :`), paths
	 * `<document>/<n>(.<n>)*`.
	 *
	 * @param mixed $ids   Ids.
	 * @param mixed $paths Paths.
	 * @return array{0: array<int, string>, 1: array<int, string>}|null
	 */
	public static function valid_marks( $ids, $paths ): ?array {
		if ( ! is_array( $ids ) || ! is_array( $paths ) || count( $ids ) !== count( $paths ) || count( $ids ) > self::MAX_ELEMENTS ) {
			return null;
		}
		$ids   = array_values( $ids );
		$paths = array_values( $paths );
		foreach ( $ids as $i => $id ) {
			if ( ! is_string( $id ) || ! preg_match( '/^[A-Za-z0-9_~.:-]{1,80}$/', $id ) || ! is_string( $paths[ $i ] ) || ! preg_match( '/^[a-z0-9_-]{1,64}\/\d{1,5}(\.\d{1,5}){0,40}$/', $paths[ $i ] ) ) {
				return null;
			}
		}
		return array( $ids, $paths );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_render( $request ) {
		$post   = get_post( (int) $request->get_param( 'post' ) );
		$markup = (string) $request->get_param( 'markup' );
		$marks  = self::valid_marks( $request->get_param( 'ids' ), $request->get_param( 'paths' ) );
		if ( ! $post || null === $marks ) {
			return new \WP_Error( 'auvyx_canvas_invalid', __( 'The canvas sent elements this site cannot mark.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		if ( strlen( $markup ) > self::MAX_MARKUP ) {
			return new \WP_Error( 'auvyx_canvas_too_large', __( 'This document is too large to draw here.', 'auvyx-builder' ), array( 'status' => 413 ) );
		}
		$styles = \Auvyx\Builder\Plugin::instance()->module( 'styles' );
		self::advance_unique_ids();
		// One document per answer: its loops' repeats are clones of this render's items.
		$this->seen = array();

		$markup                              = self::annotate( $markup, 'canvas', $marks[0], $marks[1] );
		$render                              = static function () use ( $post, $markup ) {
			return 'wp_template_part' === $post->post_type
				? Parts::with_preview( $post, static fn() => self::part_content( $markup, Parts::area( $post ) ) )
				: self::with_post( $post, static fn() => (string) apply_filters( 'the_content', $markup ) ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's filter.
		};
		list( list( $html, $css ), $assets ) = self::at_page(
			(string) $request->get_param( 'at' ),
			static fn() => Studio::with_styles( static fn() => $styles instanceof Styles ? $styles->capture( $render ) : array( $render(), '' ) )
		);

		$response = new \WP_REST_Response(
			array(
				'html'   => (string) $html,
				'css'    => (string) $css,
				'assets' => (string) $assets,
			)
		);
		$response->header( 'Cache-Control', 'no-store' );
		return $response;
	}

	/**
	 * Runs `$build` as if on the canvas's page (`at`, its path on this site): a menu marks the page it is drawn on as current
	 * (`aria-current`) from the request's path, which in this REST call would be the endpoint's.
	 *
	 * @param string   $at    Path of the canvas's page.
	 * @param callable $build What to run.
	 * @return mixed
	 */
	private static function at_page( string $at, callable $build ) {
		global $wp;
		$path = (string) wp_parse_url( $at, PHP_URL_PATH );
		$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		if ( ! $wp instanceof \WP || '' === $path || 0 !== strpos( $path, $home ) || preg_match( '/[^A-Za-z0-9\/._~%-]/', $path ) ) {
			return $build();
		}
		$saved       = $wp->request;
		$wp->request = trim( substr( $path, strlen( $home ) ), '/' );
		try {
			return $build();
		} finally {
			$wp->request = $saved;
		}
	}

	/**
	 * What WordPress does to a template part's content (its block content filters), with public functions.
	 *
	 * @param string $content Part content.
	 * @param string $area    Part area.
	 */
	private static function part_content( string $content, string $area ): string {
		$content = shortcode_unautop( $content );
		$content = do_shortcode( $content );
		$content = do_blocks( $content );
		$content = wptexturize( $content );
		$content = convert_smilies( $content );
		$content = (string) wp_filter_content_tags( $content, 'template_part_' . $area );
		global $wp_embed;
		return $wp_embed instanceof \WP_Embed ? (string) $wp_embed->autoembed( $content ) : $content;
	}

	/**
	 * Runs `$build` with the post as the shown post (blocks read it as their context, filters as the global post).
	 *
	 * @param \WP_Post $post  Post.
	 * @param callable $build What to run.
	 * @return mixed
	 */
	private static function with_post( \WP_Post $post, callable $build ) {
		// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below.
		$saved           = $GLOBALS['post'] ?? null;
		$GLOBALS['post'] = $post;
		setup_postdata( $post );
		try {
			return $build();
		} finally {
			$GLOBALS['post'] = $saved;
			if ( $saved instanceof \WP_Post ) {
				setup_postdata( $saved );
			}
		}
		// phpcs:enable WordPress.WP.GlobalVariablesOverride.Prohibited
	}

	/**
	 * Per-request names (`wp-elements-1`, a style variation's instance) restart at 1 in this request, while the frame
	 * page already used the low numbers for its own blocks: move them far away so the canvas's classes do not collide.
	 */
	private static function advance_unique_ids(): void {
		for ( $i = 0; $i < 20000; $i++ ) {
			wp_unique_id();
			wp_unique_prefixed_id( 'wp-elements-' );
		}
	}
}
