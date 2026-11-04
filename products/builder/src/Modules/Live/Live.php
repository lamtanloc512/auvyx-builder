<?php
/**
 * Studio Live (docs/studio-live-sandbox.md): the open document rendered for a visitor and shown with its code running, in
 * an opaque-origin frame.
 *
 * - `POST auvyx/v1/live` (whoever may edit the post): the Studio's block markup and element marks are kept for a few minutes
 *   under a random token; the answer is the address that shows them.
 * - `?auvyx_live=<token>`: the post's own page rendered as a visitor (no user, no admin bar, no nonce for anyone), its content
 *   replaced by the kept markup, answered with a Content-Security-Policy whose `sandbox` directive gives the document an
 *   opaque origin. The Studio frames it with the same sandbox flags, so pages reached from it stay opaque too.
 * - `GET auvyx/v1/live-asset/<path>`: a font or a code library under wp-content with `Access-Control-Allow-Origin: *`,
 *   since an opaque-origin document loads both in CORS mode and the web server does not add that header.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Live;

use Auvyx\Builder\Module;
use Auvyx\Builder\Plugin;
use Auvyx\Builder\Modules\CanvasWeb\CanvasWeb;
use Auvyx\Builder\Modules\CodeElement\CodeElement;

defined( 'ABSPATH' ) || exit;

final class Live implements Module {

	/** Transient name prefix of a kept document. */
	const KEPT = 'auvyx_live_';

	/** The kept document of this request, once read: false while unread, null when there is none. @var array<string, mixed>|null|false */
	private static $live = false;

	public function id(): string {
		return 'live';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence only; the token is checked in live().
		if ( ! isset( $_GET[ self::policy()['queryVar'] ] ) ) {
			return;
		}
		// Before anything asks who is signed in: this page is a visitor's, whatever cookies came with it.
		add_filter( 'determine_current_user', static fn() => 0, PHP_INT_MAX );
		add_filter( 'show_admin_bar', '__return_false' );
		add_filter( 'request', array( self::class, 'request' ) );
		add_filter( 'posts_results', array( self::class, 'content' ), 10, 2 );
		add_action( 'template_redirect', array( self::class, 'start' ), 0 );
		add_action( 'wp_enqueue_scripts', array( self::class, 'scripts' ) );
	}

	/** @return array<string, mixed> shared/live.json */
	public static function policy(): array {
		return Plugin::shared_data( 'live' );
	}

	// ---- keeping a document ------------------------------------------------------------------------------------

	public static function routes(): void {
		register_rest_route(
			'auvyx/v1',
			'/live',
			array(
				'methods'             => 'POST',
				'callback'            => array( self::class, 'keep' ),
				'permission_callback' => static function ( \WP_REST_Request $request ) {
					$post = get_post( (int) $request->get_param( 'post' ) );
					return $post && 'wp_template_part' !== $post->post_type && current_user_can( 'edit_post', $post->ID );
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
		register_rest_route(
			'auvyx/v1',
			'/live-asset/(?P<path>[A-Za-z0-9_.\-/]+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'asset' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request The Studio's document.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function keep( $request ) {
		$limits = self::policy()['limits'];
		$markup = (string) $request->get_param( 'markup' );
		$marks  = CanvasWeb::valid_marks( $request->get_param( 'ids' ), $request->get_param( 'paths' ) );
		if ( null === $marks ) {
			return new \WP_Error( 'auvyx_live_invalid', __( 'The Studio sent elements this site cannot mark.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		if ( strlen( $markup ) > (int) $limits['markupBytes'] ) {
			return new \WP_Error( 'auvyx_live_too_large', __( 'This document is too large to show live.', 'auvyx-builder' ), array( 'status' => 413 ) );
		}
		$token = bin2hex( random_bytes( 16 ) );
		$post  = (int) $request->get_param( 'post' );
		set_transient(
			self::KEPT . $token,
			array(
				'post'   => $post,
				'markup' => CanvasWeb::annotate( $markup, 'canvas', $marks[0], $marks[1] ),
			),
			(int) $limits['seconds']
		);
		$response = new \WP_REST_Response( array( 'url' => add_query_arg( self::policy()['queryVar'], $token, get_permalink( $post ) ) ) );
		$response->header( 'Cache-Control', 'no-store' );
		return $response;
	}

	/**
	 * The kept document this request names, or null.
	 *
	 * @return array{post: int, markup: string}|null
	 */
	public static function live(): ?array {
		if ( false === self::$live ) {
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- the token is the credential; it is random and short-lived.
			$token      = sanitize_key( wp_unslash( $_GET[ self::policy()['queryVar'] ] ?? '' ) );
			$kept       = 1 === preg_match( '/^[a-f0-9]{32}$/', $token ) ? get_transient( self::KEPT . $token ) : false;
			self::$live = is_array( $kept ) && get_post( (int) $kept['post'] ) ? $kept : null;
		}
		return self::$live;
	}

	// ---- showing it --------------------------------------------------------------------------------------------

	/**
	 * The main query asks for the kept document's post, whatever address the frame used.
	 *
	 * @param array<string, mixed> $vars Query variables.
	 * @return array<string, mixed>
	 */
	public static function request( $vars ): array {
		$live = self::live();
		if ( null === $live ) {
			return (array) $vars;
		}
		$post = get_post( $live['post'] );
		return 'page' === $post->post_type ? array( 'page_id' => $post->ID ) : array(
			'p'         => $post->ID,
			'post_type' => $post->post_type,
		);
	}

	/**
	 * The post as the Studio has it: its unsaved content, visible to a visitor though it may be a draft.
	 *
	 * @param \WP_Post[] $posts Found posts.
	 * @param \WP_Query  $query The query.
	 * @return \WP_Post[]
	 */
	public static function content( $posts, $query ): array {
		$live = self::live();
		if ( null === $live || ! $query->is_main_query() ) {
			return (array) $posts;
		}
		return array_map(
			static function ( $post ) use ( $live ) {
				if ( ! $post instanceof \WP_Post || $post->ID !== $live['post'] ) {
					return $post;
				}
				$copy               = clone $post;
				$copy->post_content = $live['markup'];
				$copy->post_status  = 'publish';
				return $copy;
			},
			(array) $posts
		);
	}

	public static function start(): void {
		if ( null === self::live() ) {
			status_header( 404 );
			nocache_headers();
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo esc_html__( 'This live view has expired. Open it again from the Studio.', 'auvyx-builder' );
			exit;
		}
		header( 'Content-Security-Policy: ' . self::csp() );
		foreach ( self::policy()['headers'] as $name => $value ) {
			header( $name . ': ' . $value );
		}
		ob_start( array( self::class, 'fonts' ) );
	}

	/** The Live document's policy: shared/live.json with this site's origins and its public data route filled in. */
	public static function csp(): string {
		$policy    = self::policy();
		$ancestors = implode( ' ', array_unique( array( self::origin( home_url() ), self::origin( admin_url() ) ) ) );
		// A source with a query string matches on its path only: with plain permalinks the data route is the site's root.
		$data  = (string) strtok( rest_url( 'auvyx/v1/data/' ), '?' );
		$parts = array( 'sandbox ' . implode( ' ', $policy['sandbox'] ) );
		foreach ( $policy['csp'] as $name => $sources ) {
			$parts[] = $name . ' ' . str_replace( array( '{site-origin}', '{data}' ), array( $ancestors, $data ), implode( ' ', $sources ) );
		}
		return implode( '; ', $parts );
	}

	private static function origin( string $url ): string {
		$parts = wp_parse_url( $url );
		return $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
	}

	/** code.js in a Live document: its libraries through the CORS route, its errors and console to the Studio. */
	public static function scripts(): void {
		$base = wp_normalize_path( (string) realpath( WP_CONTENT_DIR ) );
		$libs = wp_normalize_path( (string) realpath( AUVYX_BUILDER_DIR . 'assets' ) );
		wp_add_inline_script(
			CodeElement::HANDLE,
			'window.auvyxCodeLive=' . wp_json_encode(
				array(
					'assets' => self::asset_url( ltrim( substr( $libs, strlen( $base ) ), '/' ) . '/' ),
					'studio' => self::origin( admin_url() ),
				)
			) . ';',
			'before'
		);
	}

	/**
	 * Fonts under wp-content, asked for through the CORS route.
	 *
	 * @param string $html The page.
	 */
	public static function fonts( $html ): string {
		$content = content_url( '/' );
		return (string) preg_replace_callback(
			'#' . preg_quote( $content, '#' ) . '([A-Za-z0-9_.\-/]+\.(?:woff2|woff|ttf|otf))#',
			static fn( $m ) => self::asset_url( $m[1] ),
			(string) $html
		);
	}

	private static function asset_url( string $path ): string {
		return rest_url( 'auvyx/v1/live-asset/' . $path );
	}

	// ---- assets ------------------------------------------------------------------------------------------------

	/**
	 * A font anywhere under wp-content, or a script of this plugin's assets: the same bytes the web server serves, with
	 * the header a CORS fetch needs.
	 *
	 * @param \WP_REST_Request $request The asset asked for.
	 * @return \WP_Error|void
	 */
	public static function asset( $request ) {
		$types = self::policy()['assets'];
		$file  = self::asset_file( (string) $request->get_param( 'path' ) );
		if ( null === $file ) {
			return new \WP_Error( 'auvyx_live_asset', __( 'Not found.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		header( 'Content-Type: ' . $types[ strtolower( pathinfo( $file, PATHINFO_EXTENSION ) ) ] );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Cache-Control: public, max-age=86400' );
		header( 'X-Content-Type-Options: nosniff' );
		readfile( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- streams a font or script as is.
		exit;
	}

	/**
	 * The file a Live asset path names, or null: inside wp-content after resolving links, a listed type, and a script
	 * only from this plugin's assets.
	 *
	 * @param string $path Path under wp-content.
	 */
	public static function asset_file( string $path ): ?string {
		$types = self::policy()['assets'];
		$ext   = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$base  = realpath( WP_CONTENT_DIR );
		$file  = realpath( WP_CONTENT_DIR . '/' . $path );
		if ( ! isset( $types[ $ext ] ) || false === $base || false === $file || ! is_file( $file ) ) {
			return null;
		}
		$inside = static fn( string $dir ) => 0 === strpos( wp_normalize_path( $file ), trailingslashit( wp_normalize_path( $dir ) ) );
		if ( ! $inside( $base ) ) {
			return null;
		}
		if ( 'js' === $ext && ! $inside( (string) realpath( AUVYX_BUILDER_DIR . 'assets' ) ) ) {
			return null;
		}
		return $file;
	}
}
