<?php
/**
 * Auvyx Editor: Auvyx Builder's page editor, and its only one (Svelte 5 + TypeScript, public source in apps/editor and
 * packages/editor-core). Auvyx Builder Pro adds widgets to it; everything else is here.
 * - post.php?post=ID&action=auvyx-editor: a full-screen editor for a page (the deprecated Studio's
 *   `action=auvyx-studio` redirects here, Studio::render());
 * - load: the block tree of Studio::tree(); WordPress blocks Auvyx does not model stay verbatim;
 * - save: block markup to the REST API (post_content), byte for byte what the deprecated Auvyx Studio wrote, so pages
 *   saved by either editor open in the other.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Editor;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Studio\Studio;
use Auvyx\Builder\Modules\VisualBuilder\VisualBuilder;

defined( 'ABSPATH' ) || exit;

final class Editor implements Module {

	const ACTION = 'auvyx-editor';

	/** @var Studio */
	private $studio;

	public function __construct( Studio $studio ) {
		$this->studio = $studio;
	}

	public function id(): string {
		return 'editor';
	}

	public function requires(): array {
		return array( 'wp' => '6.5' );
	}

	public function register(): void {
		add_action( 'post_action_' . self::ACTION, array( $this, 'render' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
		add_filter( 'page_row_actions', array( $this, 'row_action' ), 11, 2 );
		add_filter( 'post_row_actions', array( $this, 'row_action' ), 11, 2 );
	}

	/** The agent's `read_url`: a public page as text (title, description, headings, links, body). */
	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			'/editor/read-url',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'read_url' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_posts' );
				},
				'args'                => array(
					'url' => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * A page the user pointed the agent at, as text: what the model needs to build from the real content instead of
	 * guessing from a domain name. Only http(s), and WordPress' safe HTTP API refuses local and private hosts.
	 *
	 * @param \WP_REST_Request $request The address.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function read_url( \WP_REST_Request $request ) {
		$url = esc_url_raw( (string) $request['url'] );
		if ( '' === $url || ! in_array( (string) wp_parse_url( $url, PHP_URL_SCHEME ), array( 'http', 'https' ), true ) ) {
			return new \WP_Error( 'auvyx_editor_url', __( 'Only an http or https address can be read.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$key   = 'auvyx_editor_url_2_' . md5( $url );
		$cache = get_transient( $key );
		if ( is_array( $cache ) ) {
			return new \WP_REST_Response( $cache );
		}
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'             => 15,
				'redirection'         => 3,
				'limit_response_size' => 2097152,
				'user-agent'          => 'Auvyx Builder editor (+' . home_url( '/' ) . ')',
				'headers'             => array( 'Accept' => 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'auvyx_editor_url', $response->get_error_message(), array( 'status' => 502 ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 400 ) {
			return new \WP_Error(
				'auvyx_editor_url',
				sprintf(
					/* translators: %d: HTTP status code */
					__( 'The page answered %d.', 'auvyx-builder' ),
					$code
				),
				array( 'status' => 502 )
			);
		}
		$type        = strtolower( (string) wp_remote_retrieve_header( $response, 'content-type' ) );
		$body        = (string) wp_remote_retrieve_body( $response );
		$data        = false !== strpos( $type, 'json' )
			? array(
				'title'       => '',
				'description' => '',
				'headings'    => array(),
				'links'       => array(),
				'images'      => array(),
				'text'        => self::words( $body, 12000 ),
			)
			: self::page_text( $body, $url );
		$data['url'] = $url;
		set_transient( $key, $data, 10 * MINUTE_IN_SECONDS );
		return new \WP_REST_Response( $data );
	}

	/**
	 * Title, description, headings, links, pictures and readable text from a page's HTML (regexes, no DOM extension).
	 *
	 * @param string $html The page.
	 * @param string $base The page's address, for relative pictures.
	 * @return array{title: string, description: string, headings: string[], links: string[], images: string[], text: string}
	 */
	private static function page_text( string $html, string $base = '' ): array {
		$title = '';
		if ( preg_match( '#<title[^>]*>(.*?)</title>#is', $html, $m ) ) {
			$title = self::words( $m[1], 200 );
		}
		$description = '';
		if ( preg_match( '#<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']#is', $html, $m )
			|| preg_match( '#<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']#is', $html, $m ) ) {
			$description = self::words( $m[1], 400 );
		}
		$headings = array();
		if ( preg_match_all( '#<(h[1-3])\b[^>]*>(.*?)</\1>#is', $html, $m, PREG_SET_ORDER ) ) {
			foreach ( array_slice( $m, 0, 40 ) as $h ) {
				$text = self::words( $h[2], 160 );
				if ( '' !== $text ) {
					$headings[] = strtoupper( $h[1] ) . ': ' . $text;
				}
			}
		}
		$links = array();
		if ( preg_match_all( '#<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>#is', $html, $m, PREG_SET_ORDER ) ) {
			foreach ( array_slice( $m, 0, 120 ) as $a ) {
				$label = self::words( $a[2], 80 );
				if ( '' !== $label ) {
					$links[] = $label . ' -> ' . $a[1];
				}
			}
		}
		$body = (string) preg_replace( '#<(script|style|noscript|svg|iframe|template)\b.*?</\1>#is', ' ', $html );
		$body = (string) preg_replace( '#<!--.*?-->#s', ' ', $body );
		return array(
			'title'       => $title,
			'description' => $description,
			'headings'    => $headings,
			'links'       => array_slice( $links, 0, 80 ),
			'images'      => self::images( $html, $base ),
			'text'        => self::words( $body, 12000 ),
		);
	}

	/**
	 * The page's pictures as absolute addresses: `<img>` (src, data-src, srcset) and `og:image`, deduplicated, without
	 * data URIs, tracking pixels and the social card's own tiny icons.
	 *
	 * @param string $html The page.
	 * @param string $base Its address.
	 * @return string[]
	 */
	private static function images( string $html, string $base ): array {
		$found = array();
		if ( preg_match( '#<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']#is', $html, $m ) ) {
			$found[] = $m[1];
		}
		if ( preg_match_all( '#<img\b[^>]*>#is', $html, $tags ) ) {
			foreach ( $tags[0] as $tag ) {
				foreach ( array( 'src', 'data-src', 'data-original' ) as $attr ) {
					if ( preg_match( '#\b' . $attr . '=["\']([^"\']+)["\']#is', $tag, $m ) ) {
						$found[] = $m[1];
						break;
					}
				}
				if ( preg_match( '#\b(?:srcset|data-srcset)=["\']([^"\']+)["\']#is', $tag, $m ) ) {
					foreach ( explode( ',', $m[1] ) as $candidate ) {
						$found[] = trim( (string) preg_replace( '#\s+\S+$#', '', trim( $candidate ) ) );
					}
				}
			}
		}
		$images = array();
		foreach ( $found as $src ) {
			$url = self::absolute( (string) $src, $base );
			if ( '' === $url || isset( $images[ $url ] ) || preg_match( '#(spacer|pixel|tracking|1x1|blank\.)#i', $url ) ) {
				continue;
			}
			$images[ $url ] = true;
			if ( count( $images ) >= 40 ) {
				break;
			}
		}
		return array_keys( $images );
	}

	/** A page's relative picture address as an absolute one ('' when it is not http(s) at all). */
	private static function absolute( string $src, string $base ): string {
		$src = trim( html_entity_decode( $src, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		if ( '' === $src || '#' === $src[0] || preg_match( '#^(data|javascript|mailto|tel):#i', $src ) ) {
			return '';
		}
		if ( preg_match( '#^https?://#i', $src ) ) {
			return $src;
		}
		$parts = wp_parse_url( $base );
		if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return '';
		}
		$origin = $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' );
		if ( 0 === strpos( $src, '//' ) ) {
			return $parts['scheme'] . ':' . $src;
		}
		if ( 0 === strpos( $src, '/' ) ) {
			return $origin . $src;
		}
		$path = isset( $parts['path'] ) ? (string) $parts['path'] : '/';
		$dir  = substr( $path, 0, (int) strrpos( $path, '/' ) + 1 );
		return $origin . $dir . $src;
	}

	/** Tags, entities and runs of space taken out; cut on a word at $max characters (UTF-8 safe). */
	private static function words( string $html, int $max ): string {
		$text = html_entity_decode( wp_strip_all_tags( $html ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$text = trim( (string) preg_replace( '/\s+/u', ' ', $text ) );
		return wp_html_excerpt( $text, $max, '…' );
	}

	/** Whether the bundle is built (auvyx-editor/editor.js). */
	public static function available(): bool {
		return is_readable( AUVYX_BUILDER_DIR . 'auvyx-editor/editor.js' );
	}

	public static function url( int $post_id ): string {
		return admin_url( 'post.php?post=' . $post_id . '&action=' . self::ACTION );
	}

	/**
	 * "Edit with Auvyx" in the list of pages, when the bundle is built.
	 *
	 * @param array<string, string> $actions Row actions.
	 * @param \WP_Post              $post    Post.
	 * @return array<string, string>
	 */
	public function row_action( $actions, $post ): array {
		$actions = (array) $actions;
		if ( self::available() && $post instanceof \WP_Post && in_array( $post->post_type, VisualBuilder::post_types(), true ) && current_user_can( 'edit_post', $post->ID ) ) {
			$actions['auvyx-editor'] = '<a href="' . esc_url( self::url( $post->ID ) ) . '">' . esc_html__( 'Edit with Auvyx', 'auvyx-builder' ) . '</a>';
		}
		return $actions;
	}

	/**
	 * What the editor starts from (Studio::config, the backend the deprecated Auvyx Studio and this editor share): the page,
	 * canvas, tokens and settings.
	 *
	 * @return array<string, mixed>
	 */
	public function config( \WP_Post $post ): array {
		$config = $this->studio->config( $post );
		/**
		 * Whether the editor's address may click, drag and save for automated checks (?click, ?menu, ?handle, ?dnd,
		 * ?saveAfter; lib/deepLink.ts). Off unless WP_DEBUG: a link someone else sends must not act in the editor.
		 */
		$config['deepLinkActions'] = (bool) apply_filters( 'auvyx_editor_deep_link_actions', defined( 'WP_DEBUG' ) && WP_DEBUG );
		return $config;
	}

	/**
	 * The page's title: the document's, or the screen's (`view=sites`: Site templates; `view=new-part`: Add New Header or
	 * Footer), which Auvyx Editor shows instead of the page editor (apps/editor/src/screens).
	 */
	private static function title( \WP_Post $post ): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- only picks the title; nothing is written.
		$view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';
		if ( 'sites' === $view ) {
			return __( 'Site templates', 'auvyx-builder' ) . ' · Auvyx';
		}
		if ( 'new-part' === $view ) {
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- only picks the title; nothing is written.
			$type = isset( $_GET['type'] ) && 'footer' === sanitize_key( wp_unslash( $_GET['type'] ) ) ? __( 'Footer', 'auvyx-builder' ) : __( 'Header', 'auvyx-builder' );
			/* translators: %s: Header or Footer */
			return sprintf( __( 'Add New %s', 'auvyx-builder' ), $type ) . ' · Auvyx';
		}
		return get_the_title( $post ) . ' · Auvyx';
	}

	/**
	 * The editor page.
	 *
	 * @param int|string $post_id Post id.
	 */
	public function render( $post_id ): void {
		$post = get_post( (int) $post_id );
		if ( ! $post || ! in_array( $post->post_type, VisualBuilder::post_types(), true ) || ! current_user_can( 'edit_post', $post->ID ) ) {
			wp_die( esc_html__( 'You cannot edit this item with Auvyx.', 'auvyx-builder' ), 403 );
		}
		if ( ! self::available() ) {
			wp_die( esc_html__( 'The Auvyx editor is not built.', 'auvyx-builder' ) );
		}
		$base    = AUVYX_BUILDER_URL . 'auvyx-editor/';
		$version = (string) filemtime( AUVYX_BUILDER_DIR . 'auvyx-editor/editor.js' );
		nocache_headers();
		header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );
		?>
<!DOCTYPE html>
<html <?php language_attributes(); ?> data-style-pack="lyra">
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<script>(function(){try{var t=localStorage.getItem('auvyx-studio:theme')||localStorage.getItem('lyra-admin-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()</script>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title><?php echo esc_html( self::title( $post ) ); ?></title>
	<?php // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- standalone app page (no wp_head). ?>
	<link rel="stylesheet" href="<?php echo esc_url( $base . 'editor.css?ver=' . $version ); ?>">
	<script>window.auvyxEditor = <?php echo wp_json_encode( $this->config( $post ), JSON_HEX_TAG | JSON_HEX_AMP ); ?>;</script>
		<?php
		// The lazy chunks import `./editor.js`: map it to the versioned URL, else the browser runs the editor twice.
		$entry = $base . 'editor.js';
		?>
	<script type="importmap"><?php echo wp_json_encode( array( 'imports' => array( $entry => $entry . '?ver=' . $version ) ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ); ?></script>
	<?php // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript -- standalone app page, ES module. ?>
	<script type="module" src="<?php echo esc_url( $base . 'editor.js?ver=' . $version ); ?>"></script>
</head>
<body>
	<div id="app"></div>
</body>
</html>
		<?php
		exit;
	}
}
