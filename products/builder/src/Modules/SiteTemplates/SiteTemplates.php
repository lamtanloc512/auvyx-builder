<?php
/**
 * Site templates (docs/site-templates.md): a whole site in one `auvyx-site/1`, `auvyx-site/2` or `auvyx-site/3` JSON file. Auvyx Builder ships
 * none: themes and add-ons add folders of read-only ones with the `auvyx_builder_site_template_dirs` filter (a port's child theme,
 * ports/), the site's own are kept in
 * the private `auvyx_site_template` post type. The Studio reads, checks and applies them (shared SiteTemplate, the same on
 * EzyPlatform); this module stores them and gives the Studio what applying and capturing a site need on WordPress:
 * the site's pages and header/footer as Studio trees, the front page, and saving the header or footer.
 *
 * The JSON is kept in post meta (kses would rewrite the escapes in post content) and never printed: applying saves
 * pages through the usual REST paths, with the current user's own filtering.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\SiteTemplates;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Studio\Parts;
use Auvyx\Builder\Modules\Studio\Studio;

defined( 'ABSPATH' ) || exit;

final class SiteTemplates implements Module {

	const POST_TYPE = 'auvyx_site_template';
	const META      = '_auvyx_site_template';
	const SCHEMA    = 'auvyx-site/2';
	/** Schemas read: auvyx-site/2 adds content types and sample entries (checked by the Studio and ContentTypes); auvyx-site/3 adds a blueprint's
	 *  requires, presets, catalog and settings (BlueprintPlan; the Studio and EzyPlatform's server act on them, this module only stores the file). */
	const SCHEMAS   = array( 'auvyx-site/1', 'auvyx-site/2', 'auvyx-site/3' );
	const MAX_BYTES = 4194304;
	const ID        = '/^[a-z0-9][a-z0-9_-]{0,63}$/';
	const MAX_PAGES = 60;
	/** Page meta: the name of the site template a page was made from (templates give pages the same names). */
	const ORIGIN = 'auvyx_from_template';

	public function id(): string {
		return 'site-templates';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'post_type' ) );
		add_action( 'init', array( $this, 'origin_meta' ) );
		add_action( 'rest_api_init', array( $this, 'routes' ) );
		add_filter( 'display_post_states', array( $this, 'post_states' ), 10, 2 );
	}

	public function origin_meta(): void {
		foreach ( array( 'page', 'post' ) as $type ) {
			register_post_meta(
				$type,
				self::ORIGIN,
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => true,
					'sanitize_callback' => static fn( $value ) => mb_substr( sanitize_text_field( (string) $value ), 0, 200 ),
					'auth_callback'     => static fn( $allowed, $meta_key, $post_id ) => current_user_can( 'edit_post', (int) $post_id ),
				)
			);
		}
	}

	/**
	 * The Pages list names the site template a page came from, beside its title.
	 *
	 * @param array<string, string> $states Post states.
	 * @param \WP_Post              $post   The listed post.
	 * @return array<string, string>
	 */
	public function post_states( $states, $post ): array {
		$states = is_array( $states ) ? $states : array();
		if ( $post instanceof \WP_Post && in_array( $post->post_type, array( 'page', 'post' ), true ) ) {
			$origin = (string) get_post_meta( $post->ID, self::ORIGIN, true );
			if ( '' !== $origin ) {
				/* translators: %s: site template name. */
				$states['auvyx_from_template'] = esc_html( sprintf( __( 'From template: %s', 'auvyx-builder' ), $origin ) );
			}
		}
		return $states;
	}

	public function post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'label'        => __( 'Site templates', 'auvyx-builder' ),
				'public'       => false,
				'show_ui'      => false,
				'show_in_rest' => false,
				'supports'     => array( 'title' ),
				'can_export'   => true,
			)
		);
	}

	public static function can(): bool {
		return current_user_can( 'edit_theme_options' );
	}

	/**
	 * Where a template's shop routes (apps/studio BlueprintPlan.Routes: /store, /shop, /account, /track-order, and the
	 * category and brand pages) lead on this site, so the Studio links a template's menus and buttons to this shop's own
	 * pages when it applies one. Without WooCommerce the shop's routes lead home.
	 *
	 * @return array{store: string, shop: string, account: string, track: string, category: string, brand: string}
	 */
	public static function shop_routes(): array {
		$home = home_url( '/' );
		if ( ! function_exists( 'wc_get_page_permalink' ) ) {
			return array(
				'store'    => $home,
				'shop'     => $home,
				'account'  => $home,
				'track'    => $home,
				'category' => '',
				'brand'    => '',
			);
		}
		$account = (string) wc_get_page_permalink( 'myaccount' );
		$base    = static function ( string $taxonomy ): string {
			$tax  = get_taxonomy( $taxonomy );
			$slug = $tax && is_array( $tax->rewrite ) && ! empty( $tax->rewrite['slug'] ) ? (string) $tax->rewrite['slug'] : '';
			return '' === $slug ? '' : trailingslashit( home_url( '/' . $slug ) );
		};
		return array(
			'store'    => $home,
			'shop'     => (string) wc_get_page_permalink( 'shop' ),
			'account'  => $account,
			/** Auvyx Woo's order tracking page, when it has one (else the account's orders). */
			'track'    => (string) apply_filters( 'auvyx_theme_track_order_url', $account ), // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Auvyx Theme's and Auvyx Woo's filter.
			'category' => $base( 'product_cat' ),
			'brand'    => $base( 'product_brand' ),
		);
	}

	public function routes(): void {
		$id = '(?P<id>[a-z0-9][a-z0-9_-]{0,63})';
		register_rest_route(
			'auvyx/v1',
			'/site-templates',
			array(
				array(
					'methods'             => 'GET',
					'permission_callback' => array( self::class, 'can' ),
					'callback'            => static fn() => new \WP_REST_Response( array( 'items' => self::summaries() ) ),
				),
				array(
					'methods'             => 'POST',
					'permission_callback' => array( self::class, 'can' ),
					'callback'            => array( self::class, 'rest_save' ),
					'args'                => array(
						'template' => array(
							'type'     => 'string',
							'required' => true,
						),
					),
				),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/site-templates/site',
			array(
				'methods'             => 'GET',
				'permission_callback' => array( self::class, 'can' ),
				'callback'            => static fn() => new \WP_REST_Response( self::site() ),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/site-templates/front',
			array(
				'methods'             => 'POST',
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
				'callback'            => array( self::class, 'rest_front' ),
				'args'                => array(
					'page' => array(
						'type'     => 'integer',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/site-templates/part',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( self::class, 'can' ),
				'callback'            => array( self::class, 'rest_part' ),
				'args'                => array(
					'area'    => array(
						'type'     => 'string',
						'enum'     => array( 'header', 'footer' ),
						'required' => true,
					),
					'content' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/site-templates/' . $id,
			array(
				array(
					'methods'             => 'GET',
					'permission_callback' => array( self::class, 'can' ),
					'callback'            => array( self::class, 'rest_get' ),
				),
				array(
					'methods'             => 'DELETE',
					'permission_callback' => array( self::class, 'can' ),
					'callback'            => array( self::class, 'rest_delete' ),
				),
			)
		);
	}

	// ---- storage ----------------------------------------------------------------------------

	/**
	 * The read-only templates themes and add-ons add: id → file.
	 *
	 * @return array<string, string>
	 */
	public static function built_in(): array {
		/**
		 * Folders of read-only site templates (`*.json`, one template each). Auvyx Builder adds none.
		 *
		 * @param string[] $dirs
		 */
		$dirs  = (array) apply_filters( 'auvyx_builder_site_template_dirs', array() );
		$files = array();
		foreach ( $dirs as $dir ) {
			foreach ( (array) glob( trailingslashit( (string) $dir ) . '*.json' ) as $file ) {
				$id = basename( (string) $file, '.json' );
				if ( 1 === preg_match( self::ID, $id ) && ! isset( $files[ $id ] ) ) {
					$files[ $id ] = (string) $file;
				}
			}
		}
		return $files;
	}

	private static function post( string $id ): ?\WP_Post {
		$posts = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'name'           => $id,
				'post_status'    => 'any',
				'posts_per_page' => 1,
			)
		);
		return $posts ? $posts[0] : null;
	}

	/** The template's JSON, '' when there is none (the site's own wins over a built-in with the same id). */
	public static function json( string $id ): string {
		$post = self::post( $id );
		if ( $post ) {
			return (string) get_post_meta( $post->ID, self::META, true );
		}
		$files = self::built_in();
		return isset( $files[ $id ] ) ? (string) file_get_contents( $files[ $id ] ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local file of the plugin.
	}

	/**
	 * What a list shows of a template.
	 *
	 * @param array<string, mixed> $t Decoded template.
	 * @return array<string, mixed>
	 */
	private static function summary( array $t, bool $built_in ): array {
		$pages = is_array( $t['pages'] ?? null ) ? $t['pages'] : array();
		return array(
			'id'          => (string) ( $t['id'] ?? '' ),
			'title'       => (string) ( $t['title'] ?? '' ),
			'description' => (string) ( $t['description'] ?? '' ),
			'screenshot'  => (string) ( $t['screenshot'] ?? '' ),
			'pages'       => array_values( array_map( static fn( $p ) => (string) ( is_array( $p ) ? ( $p['title'] ?? '' ) : '' ), $pages ) ),
			'builtIn'     => $built_in,
		);
	}

	/** @return array<int, array<string, mixed>> */
	public static function summaries(): array {
		$own = array();
		foreach ( get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => 200,
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		) as $post ) {
			$t = json_decode( (string) get_post_meta( $post->ID, self::META, true ), true );
			if ( is_array( $t ) ) {
				$own[ $post->post_name ] = self::summary( $t, false );
			}
		}
		$built = array();
		foreach ( self::built_in() as $id => $file ) {
			$t = isset( $own[ $id ] ) ? null : json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			if ( is_array( $t ) ) {
				$built[] = self::summary( $t, true );
			}
		}
		return array_merge( array_values( $own ), $built );
	}

	/**
	 * The checks the server makes before keeping a template (the Studio checks the rest with the shared SiteTemplate).
	 *
	 * @return array<string, mixed>|\WP_Error Decoded template.
	 */
	public static function validate( string $json ) {
		if ( strlen( $json ) > self::MAX_BYTES ) {
			return new \WP_Error( 'auvyx_site_template_size', __( 'The template is larger than 4 MB.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$t = json_decode( $json, true );
		if ( ! is_array( $t ) ) {
			return new \WP_Error( 'auvyx_site_template_json', __( 'The template is not a JSON object.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$problems = array();
		if ( ! in_array( $t['schema'] ?? '', self::SCHEMAS, true ) ) {
			$problems[] = 'schema must be "' . self::SCHEMA . '"';
		}
		if ( ! is_string( $t['id'] ?? null ) || 1 !== preg_match( self::ID, $t['id'] ) ) {
			$problems[] = 'id: lowercase letters, digits, - and _';
		}
		if ( ! is_string( $t['title'] ?? null ) || '' === trim( $t['title'] ) ) {
			$problems[] = 'title is empty';
		}
		if ( ! is_array( $t['pages'] ?? null ) || ! $t['pages'] || count( $t['pages'] ) > self::MAX_PAGES ) {
			$problems[] = 'pages: 1 to ' . self::MAX_PAGES;
		}
		return $problems ? new \WP_Error( 'auvyx_site_template_invalid', implode( '; ', $problems ), array( 'status' => 400 ) ) : $t;
	}

	/**
	 * Creates or replaces one of the site's templates. A built-in id becomes the site's own copy, which wins in lists.
	 *
	 * @return array<string, mixed>|\WP_Error Summary.
	 */
	public static function save( string $json ) {
		$t = self::validate( $json );
		if ( is_wp_error( $t ) ) {
			return $t;
		}
		$post   = self::post( $t['id'] );
		$fields = array(
			'post_type'   => self::POST_TYPE,
			'post_status' => 'publish',
			'post_name'   => $t['id'],
			'post_title'  => sanitize_text_field( $t['title'] ),
		);
		$id     = $post ? wp_update_post( $fields + array( 'ID' => $post->ID ), true ) : wp_insert_post( $fields, true );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		// Slashed: update_post_meta unslashes, which would eat the JSON's escapes.
		update_post_meta( (int) $id, self::META, wp_slash( $json ) );
		return self::summary( $t, false );
	}

	/** @return true|\WP_Error */
	public static function delete( string $id ) {
		$post = self::post( $id );
		if ( ! $post ) {
			return new \WP_Error(
				'auvyx_site_template_missing',
				isset( self::built_in()[ $id ] ) ? __( 'Built-in templates cannot be deleted.', 'auvyx-builder' ) : __( 'No such template.', 'auvyx-builder' ),
				array( 'status' => isset( self::built_in()[ $id ] ) ? 403 : 404 )
			);
		}
		wp_delete_post( $post->ID, true );
		return true;
	}

	// ---- the site, for applying and capturing -----------------------------------------------

	/**
	 * The site's pages (with their Studio trees), header and footer, for "save this site as a template".
	 *
	 * @return array<string, mixed>
	 */
	public static function site(): array {
		$front = 'page' === get_option( 'show_on_front' ) ? (int) get_option( 'page_on_front' ) : 0;
		$pages = array();
		foreach ( get_posts(
			array(
				'post_type'      => 'page',
				'post_status'    => array( 'publish', 'draft', 'private' ),
				'posts_per_page' => self::MAX_PAGES,
				'orderby'        => 'menu_order title',
				'order'          => 'ASC',
			)
		) as $page ) {
			if ( ! current_user_can( 'edit_post', $page->ID ) ) {
				continue;
			}
			$pages[] = array(
				'id'       => (int) $page->ID,
				'title'    => $page->post_title,
				'slug'     => $page->post_name,
				'template' => (string) get_page_template_slug( $page ),
				'front'    => $front === (int) $page->ID,
				'url'      => (string) get_permalink( $page ),
				'blocks'   => Studio::tree( parse_blocks( $page->post_content ) ),
			);
		}
		$parts = array();
		foreach ( array( 'header', 'footer' ) as $area ) {
			$part = self::part( $area );
			if ( $part ) {
				$parts[ $area ] = Studio::tree( parse_blocks( $part->content ) );
			}
		}
		return array(
			'pages' => $pages,
			'parts' => (object) $parts,
		);
	}

	/**
	 * The active theme's part every page shows for an area: the one named after it (`header`), else the one most of
	 * its templates show (a theme may have others for one screen, like auvyx-theme's checkout header).
	 */
	private static function part( string $area ): ?\WP_Block_Template {
		$best  = null;
		$count = -1;
		foreach ( Parts::all() as $part ) {
			if ( $area !== $part->area ) {
				continue;
			}
			if ( $area === $part->slug ) {
				return $part;
			}
			$used = count( Parts::templates_using( $part->slug ) );
			if ( $used > $count ) {
				$best  = $part;
				$count = $used;
			}
		}
		return $best;
	}

	// ---- REST ---------------------------------------------------------------------------------

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_save( $request ) {
		$summary = self::save( (string) $request['template'] );
		return is_wp_error( $summary ) ? $summary : new \WP_REST_Response( $summary );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_get( $request ) {
		$id   = (string) $request['id'];
		$json = self::json( $id );
		if ( '' === $json ) {
			return new \WP_Error( 'auvyx_site_template_missing', __( 'No such template.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		return new \WP_REST_Response(
			array(
				'json'    => $json,
				'builtIn' => ! self::post( (string) $request['id'] ),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_delete( $request ) {
		$done = self::delete( (string) $request['id'] );
		return is_wp_error( $done ) ? $done : new \WP_REST_Response( array( 'deleted' => true ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_front( $request ) {
		$page = get_post( (int) $request['page'] );
		if ( ! $page || 'page' !== $page->post_type || ! current_user_can( 'edit_post', $page->ID ) ) {
			return new \WP_Error( 'auvyx_site_template_page', __( 'No such page.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', (int) $page->ID );
		return new \WP_REST_Response( array( 'front' => (int) $page->ID ) );
	}

	/**
	 * Replaces the header or footer the theme shows with block markup (through core's template parts endpoint, so the
	 * theme's file becomes a saved part the user can still reset).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_part( $request ) {
		$part = self::part( (string) $request['area'] );
		if ( ! $part ) {
			return new \WP_Error( 'auvyx_site_template_part', __( 'The theme has no such part.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		$save = new \WP_REST_Request( 'POST', '/wp/v2/template-parts/' . $part->id );
		$save->set_param( 'content', (string) $request['content'] );
		$answer = rest_do_request( $save );
		if ( $answer->is_error() ) {
			return $answer->as_error();
		}
		return new \WP_REST_Response( array( 'part' => $part->id ) );
	}
}
