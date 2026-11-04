<?php
/**
 * Auvyx Play (docs/play-sandbox.md): games the site owns and serves isolated. A game is a `auvyx_game` post, named by a key
 * the Studio makes (shared/play.json "keyPattern", kept as post meta and its slug) so a page names its game before the site
 * has saved it; saving a key creates or replaces that game. Its source
 * (HTML, CSS, ES module, libraries, assets) is kept as JSON in post meta, so no content filter rewrites it. The site
 * answers `?auvyx_play=<id>` with the game's document and a Content-Security-Policy whose `sandbox` directive gives it an
 * opaque origin: it runs on this domain but cannot reach this site's cookies, storage, pages or REST API. Anyone who
 * may write posts may make games, since nothing a game does reaches past its frame.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Play;

use Auvyx\Builder\Module;
use Auvyx\Builder\Plugin;

defined( 'ABSPATH' ) || exit;

final class Play implements Module {

	public const TYPE      = 'auvyx_game';
	public const META      = '_auvyx_game';
	public const KEY       = '_auvyx_game_key';
	public const QUERY_VAR = 'auvyx_play';
	public const HANDLE    = 'auvyx-play';

	public function id(): string {
		return 'play';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( self::class, 'register_type' ) );
		add_filter(
			'query_vars',
			static function ( array $vars ): array {
				$vars[] = self::QUERY_VAR;
				return $vars;
			}
		);
		add_action( 'parse_request', array( self::class, 'maybe_serve' ) );
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
		add_filter( 'render_block_auvyx/section', array( self::class, 'render' ), 10, 2 );
	}

	public static function register_type(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/play-page.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
		register_post_type(
			self::TYPE,
			array(
				'labels'          => array(
					'name'          => __( 'Games', 'auvyx-builder' ),
					'singular_name' => __( 'Game', 'auvyx-builder' ),
				),
				'public'          => false,
				'show_ui'         => false,
				'show_in_rest'    => false,
				'supports'        => array( 'title', 'author' ),
				'capability_type' => 'post',
				'map_meta_cap'    => true,
			)
		);
	}

	// ---- the source ---------------------------------------------------------------------------------

	/**
	 * A game's source from what a client sent, or an error saying what is wrong. Libraries the sandbox does not offer
	 * are dropped; assets need a name, a MIME type and an http(s) address.
	 *
	 * @param array<string, mixed> $input What was sent.
	 * @return array{title: string, lang: string, html: string, css: string, js: string, libs: string[], assets: array<int, array{name: string, type: string, url: string}>, poster: string}|\WP_Error
	 */
	public static function parse( array $input ) {
		$text  = static function ( string $key ) use ( $input ): string {
			return is_string( $input[ $key ] ?? null ) ? $input[ $key ] : '';
		};
		$title = trim( sanitize_text_field( $text( 'title' ) ) );
		if ( '' === $title ) {
			return new \WP_Error( 'auvyx_game_title', __( 'A game needs a title.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$source = array(
			'title'  => mb_substr( $title, 0, 200 ),
			'lang'   => $text( 'lang' ) ? $text( 'lang' ) : 'en',
			'html'   => $text( 'html' ),
			'css'    => $text( 'css' ),
			'js'     => $text( 'js' ),
			'libs'   => PlayDocument::libs( array_filter( (array) ( $input['libs'] ?? array() ), 'is_string' ) ),
			'assets' => array(),
			'poster' => esc_url_raw( $text( 'poster' ), array( 'http', 'https' ) ),
		);
		$over   = PlayDocument::over_limit( $source );
		if ( null !== $over ) {
			return new \WP_Error( 'auvyx_game_too_big', $over, array( 'status' => 413 ) );
		}
		$limit = (int) Plugin::shared_data( 'play' )['limits']['assets'];
		foreach ( (array) ( $input['assets'] ?? array() ) as $asset ) {
			$asset = is_array( $asset ) ? $asset : array();
			$name  = is_string( $asset['name'] ?? null ) ? $asset['name'] : '';
			$type  = is_string( $asset['type'] ?? null ) ? $asset['type'] : '';
			$url   = esc_url_raw( is_string( $asset['url'] ?? null ) ? $asset['url'] : '', array( 'http', 'https' ) );
			if ( ! preg_match( '/^[\w][\w .()-]{0,99}$/', $name ) || ! preg_match( '#^[a-z]+/[\w.+-]+$#', $type ) || '' === $url ) {
				return new \WP_Error( 'auvyx_game_asset', __( 'An asset needs a name, a type and an address.', 'auvyx-builder' ), array( 'status' => 400 ) );
			}
			$source['assets'][] = array(
				'name' => $name,
				'type' => $type,
				'url'  => $url,
			);
		}
		if ( count( $source['assets'] ) > $limit ) {
			/* translators: %d: the most assets a game may have. */
			return new \WP_Error( 'auvyx_game_assets', sprintf( __( 'A game may have at most %d assets.', 'auvyx-builder' ), $limit ), array( 'status' => 400 ) );
		}
		return $source;
	}

	public static function is_key( string $key ): bool {
		return (bool) preg_match( '/' . Plugin::shared_data( 'play' )['keyPattern'] . '/D', $key );
	}

	/** The post that holds a game, or 0. */
	public static function find( string $key ): int {
		if ( ! self::is_key( $key ) ) {
			return 0;
		}
		$ids = get_posts(
			array(
				'post_type'      => self::TYPE,
				'post_status'    => array( 'publish', 'draft' ),
				'meta_key'       => self::KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'orderby'        => 'ID',
				'order'          => 'ASC',
			)
		);
		return $ids ? (int) $ids[0] : 0;
	}

	/**
	 * The kept source of a game (by its post), or null.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function source( int $id ): ?array {
		$post = get_post( $id );
		if ( ! $post || self::TYPE !== $post->post_type ) {
			return null;
		}
		$data = json_decode( (string) get_post_meta( $id, self::META, true ), true );
		return is_array( $data ) ? array_merge( $data, array( 'title' => $post->post_title ) ) : null;
	}

	/**
	 * Keeps the game with this key (creates it, or replaces it) and returns its post id.
	 *
	 * @param array<string, mixed> $source A parsed source.
	 * @return int|\WP_Error
	 */
	public static function save( string $key, array $source, string $status = 'publish' ) {
		if ( ! self::is_key( $key ) ) {
			return new \WP_Error( 'auvyx_game_key', __( 'A game needs a valid key.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$id   = self::find( $key );
		$post = array(
			'post_type'   => self::TYPE,
			'post_title'  => $source['title'],
			'post_name'   => $key,
			'post_status' => 'draft' === $status ? 'draft' : 'publish',
		);
		if ( $id > 0 ) {
			$post['ID'] = $id;
		}
		$saved = $id > 0 ? wp_update_post( $post, true ) : wp_insert_post( $post, true );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		$data = $source;
		unset( $data['title'] );
		update_post_meta( (int) $saved, self::META, wp_slash( (string) wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ) );
		update_post_meta( (int) $saved, self::KEY, $key );
		return (int) $saved;
	}

	// ---- serving ------------------------------------------------------------------------------------

	/** Where a game's document is served. */
	public static function url( string $key ): string {
		return add_query_arg( self::QUERY_VAR, $key, home_url( '/' ) );
	}

	/** The game runtime script, beside code.js. */
	public static function runtime_url(): string {
		return AUVYX_BUILDER_URL . 'assets/play-game.js?ver=' . rawurlencode( AUVYX_BUILDER_VERSION );
	}

	/** scheme://host[:port] of an address. */
	private static function origin( string $url ): string {
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
			return '';
		}
		return ( $parts['scheme'] ?? 'https' ) . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
	}

	/**
	 * What the site answers for a game: published games to everyone, others only to who may edit them (the Studio's
	 * preview of a draft).
	 *
	 * @return array{status: int, headers: array<string, string>, body: string}
	 */
	public static function response( string $key ): array {
		$id     = self::find( $key );
		$post   = get_post( $id );
		$source = self::source( $id );
		$seen   = $post && ( 'publish' === $post->post_status || current_user_can( 'edit_post', $id ) );
		if ( null === $source || ! $seen ) {
			return array(
				'status'  => 404,
				'headers' => array( 'Content-Type' => 'text/plain; charset=utf-8' ),
				'body'    => 'Not found',
			);
		}
		$runtime   = self::runtime_url();
		$ancestors = implode( ' ', array_unique( array_filter( array( self::origin( home_url() ), self::origin( admin_url() ) ) ) ) );
		$headers   = array_merge(
			array(
				'Content-Type'            => 'text/html; charset=utf-8',
				'Content-Security-Policy' => PlayDocument::csp( $ancestors, self::origin( $runtime ) ),
			),
			Plugin::shared_data( 'play' )['headers']
		);
		return array(
			'status'  => 200,
			'headers' => $headers,
			'body'    => PlayDocument::render( $source, $runtime ),
		);
	}

	/** @param \WP $wp The request being parsed. */
	public static function maybe_serve( $wp ): void {
		$key = isset( $wp->query_vars[ self::QUERY_VAR ] ) ? (string) $wp->query_vars[ self::QUERY_VAR ] : '';
		if ( '' === $key ) {
			return;
		}
		$answer = self::response( $key );
		status_header( $answer['status'] );
		foreach ( $answer['headers'] as $name => $value ) {
			header( $name . ': ' . $value );
		}
		echo $answer['body']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the game's own document, served sandboxed (PlayDocument escapes what could leave its element).
		exit;
	}

	// ---- on a page ----------------------------------------------------------------------------------

	/**
	 * What a page shows for a game a visitor may play (published), or null.
	 *
	 * @return array{id: string, title: string, src: string, poster: string, assets: array<int, array{name: string, type: string, url: string}>}|null
	 */
	public static function embed_of( string $key ): ?array {
		$id     = self::find( $key );
		$post   = get_post( $id );
		$source = self::source( $id );
		if ( null === $source || ! $post || ( 'publish' !== $post->post_status && ! current_user_can( 'edit_post', $id ) ) ) {
			return null;
		}
		return array(
			'id'     => $key,
			'title'  => (string) $source['title'],
			'src'    => self::url( $key ),
			'poster' => (string) ( $source['poster'] ?? '' ),
			'assets' => (array) ( $source['assets'] ?? array() ),
		);
	}

	/**
	 * A game element (an Auvyx Section whose `auvyx.game` names a game): the game's poster and play button inside it.
	 *
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public static function render( $html, $block ): string {
		$html = (string) $html;
		$id   = $block['attrs']['auvyx']['game'] ?? null;
		if ( '' === $html || ! is_string( $id ) || ! self::is_key( $id ) ) {
			return $html;
		}
		$game  = self::embed_of( $id );
		$inner = null === $game ? '' : PlayDocument::embed( $game, __( 'Play', 'auvyx-builder' ) );
		if ( null !== $game ) {
			wp_enqueue_script( self::HANDLE );
		}
		$end = strrpos( $html, '</' );
		return false === $end ? $html : substr( $html, 0, $end ) . $inner . substr( $html, $end );
	}

	// ---- REST ---------------------------------------------------------------------------------------

	public static function routes(): void {
		register_rest_route(
			'auvyx/v1',
			'/games',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'list_games' ),
				'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
			)
		);
		$may = static function ( \WP_REST_Request $request, string $cap ): bool {
			$id = self::find( (string) $request['key'] );
			return $id > 0 ? current_user_can( $cap, $id ) : ( 'edit_post' === $cap && current_user_can( 'edit_posts' ) );
		};
		register_rest_route(
			'auvyx/v1',
			'/games/(?P<key>[a-z0-9-]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'get_game' ),
					'permission_callback' => static fn( \WP_REST_Request $r ) => $may( $r, 'edit_post' ),
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( self::class, 'put_game' ),
					'permission_callback' => static fn( \WP_REST_Request $r ) => $may( $r, 'edit_post' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'delete_game' ),
					'permission_callback' => static fn( \WP_REST_Request $r ) => self::find( (string) $r['key'] ) > 0 && $may( $r, 'delete_post' ),
				),
			)
		);
	}

	/** @return array<string, mixed> */
	private static function answer( string $key ): array {
		$id   = self::find( $key );
		$post = get_post( $id );
		return array_merge(
			(array) self::source( $id ),
			array(
				'key'      => $key,
				'status'   => $post ? $post->post_status : 'draft',
				'url'      => self::url( $key ),
				'modified' => $post ? (string) $post->post_modified_gmt : '',
			)
		);
	}

	public static function list_games(): \WP_REST_Response {
		$ids = get_posts(
			array(
				'post_type'      => self::TYPE,
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => 200,
				'fields'         => 'ids',
				'orderby'        => 'modified',
			)
		);
		$out = array();
		foreach ( $ids as $id ) {
			$key = (string) get_post_meta( (int) $id, self::KEY, true );
			if ( '' !== $key && current_user_can( 'edit_post', (int) $id ) ) {
				$post  = get_post( (int) $id );
				$out[] = array(
					'key'      => $key,
					'title'    => $post ? $post->post_title : '',
					'status'   => $post ? $post->post_status : '',
					'url'      => self::url( $key ),
					'modified' => $post ? (string) $post->post_modified_gmt : '',
				);
			}
		}
		return new \WP_REST_Response( array( 'games' => $out ) );
	}

	/** @return \WP_REST_Response|\WP_Error */
	public static function put_game( \WP_REST_Request $request ) {
		$key    = (string) $request['key'];
		$body   = (array) $request->get_json_params();
		$source = self::parse( $body );
		if ( is_wp_error( $source ) ) {
			return $source;
		}
		$status = is_string( $body['status'] ?? null ) ? $body['status'] : 'publish';
		if ( 'publish' === $status && ! current_user_can( 'publish_posts' ) ) {
			$status = 'draft';
		}
		$existed = self::find( $key ) > 0;
		$saved   = self::save( $key, $source, $status );
		return is_wp_error( $saved ) ? $saved : new \WP_REST_Response( self::answer( $key ), $existed ? 200 : 201 );
	}

	/** @return \WP_REST_Response|\WP_Error */
	public static function get_game( \WP_REST_Request $request ) {
		$key = (string) $request['key'];
		if ( self::find( $key ) <= 0 ) {
			return new \WP_Error( 'auvyx_game_missing', __( 'No such game.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		return new \WP_REST_Response( self::answer( $key ) );
	}

	public static function delete_game( \WP_REST_Request $request ): \WP_REST_Response {
		wp_delete_post( self::find( (string) $request['key'] ), true );
		return new \WP_REST_Response( array( 'deleted' => true ) );
	}
}
