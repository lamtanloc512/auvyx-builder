<?php
/**
 * What Auvyx's MCP server (apps/studio/packages/mcp, docs/mcp-v2.md) needs from the site: the site at a glance (blocks,
 * templates, parts, libraries, the design brief, the token's scopes, plugins' tools), a page as the Studio reads it
 * (the block tree and its version), and the safe writes: create a draft, save with a version check (drafts by
 * default, code waits for an administrator), revisions and restore, trash, the front page. Pages are written only
 * here, never through `wp/v2/pages` (McpAccess refuses that to a token).
 *
 * The AI calls these with an Auvyx token (McpAccess): it acts as the administrator who made it, within its scopes; every
 * route still checks that user's capabilities.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Mcp;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\McpAccess\McpAccess;
use Auvyx\Builder\Modules\McpAccess\Rules;
use Auvyx\Builder\Modules\BlankPage\BlankPage;
use Auvyx\Builder\Modules\CodeElement\CodeElement;
use Auvyx\Builder\Modules\Studio\Studio;
use Auvyx\Builder\Plugin;

defined( 'ABSPATH' ) || exit;

final class Mcp implements Module {

	public const NS = 'auvyx/v1';

	/** The query argument of a draft's preview link, and how long a link works. */
	public const PREVIEW_ARG = 'auvyx_preview';
	public const PREVIEW_TTL = 900;

	/** The vibe (design direction) the site's pages were built with, so a later session keeps to it. */
	public const VIBE_OPTION = 'auvyx_mcp_vibe';

	public function id(): string {
		return 'mcp';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
		add_filter( 'posts_results', array( $this, 'preview' ), 10, 2 );
		add_filter( 'is_protected_meta', array( $this, 'protect' ), 10, 2 );
	}

	/**
	 * The waiting code and the revisions' `via` are not custom fields anyone edits.
	 *
	 * @param bool   $protected Protected so far.
	 * @param string $key       Meta key.
	 */
	public function protect( $protected, $key ): bool {
		return in_array( $key, array( Pending::META, Writes::VIA_META ), true ) ? true : (bool) $protected;
	}

	/** Whether the current user may edit this post (and it exists, and is a page-like post, not media or a revision). */
	public static function editable( \WP_REST_Request $request ): bool {
		$post = get_post( (int) $request['id'] );
		return $post instanceof \WP_Post && ! in_array( $post->post_type, array( 'attachment', 'revision', 'nav_menu_item' ), true ) && current_user_can( 'edit_post', $post->ID );
	}

	public function register_rest(): void {
		register_rest_route(
			self::NS,
			'/mcp/site',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'site' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_pages' );
				},
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/document/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'document' ),
				'permission_callback' => array( self::class, 'editable' ),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/preview/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'preview_link' ),
				'permission_callback' => array( self::class, 'editable' ),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/front-page',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'front_page' ),
				'permission_callback' => static function () {
					return current_user_can( 'manage_options' );
				},
				'args'                => array(
					'id' => array(
						'type'     => 'integer',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/vibe',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'set_vibe' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_theme_options' );
				},
				'args'                => array(
					'id' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/pages',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'create_page' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_pages' );
				},
				'args'                => array(
					'title'    => array(
						'type'     => 'string',
						'required' => true,
					),
					'slug'     => array( 'type' => 'string' ),
					'template' => array( 'type' => 'string' ),
					'content'  => array( 'type' => 'string' ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/save/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'save' ),
				'permission_callback' => array( self::class, 'editable' ),
				'args'                => array(
					'content'  => array(
						'type'     => 'string',
						'required' => true,
					),
					'version'  => array(
						'type'     => 'string',
						'required' => true,
					),
					'title'    => array( 'type' => 'string' ),
					'status'   => array(
						'type' => 'string',
						'enum' => array( 'draft', 'pending', 'publish', 'private' ),
					),
					'template' => array( 'type' => 'string' ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/revisions/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'revisions' ),
				'permission_callback' => array( self::class, 'editable' ),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/restore/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'restore' ),
				'permission_callback' => array( self::class, 'editable' ),
				'args'                => array(
					'revision' => array(
						'type'     => 'integer',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/trash/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'trash' ),
				'permission_callback' => static function ( \WP_REST_Request $request ) {
					return self::editable( $request ) && current_user_can( 'delete_post', (int) $request['id'] );
				},
			)
		);
		register_rest_route(
			self::NS,
			'/mcp/pending/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( Pending::class, 'decide' ),
				'permission_callback' => array( Pending::class, 'permission' ),
				'args'                => array(
					'decision' => array(
						'type'     => 'string',
						'required' => true,
						'enum'     => array( 'approve', 'discard' ),
					),
				),
			)
		);
	}

	public function set_vibe( \WP_REST_Request $request ): \WP_REST_Response {
		$id = sanitize_key( (string) $request['id'] );
		update_option( self::VIBE_OPTION, $id, false );
		return rest_ensure_response( array( 'vibe' => $id ) );
	}

	/**
	 * The font families the site serves (the theme's and those installed for a design preset): a section names them by
	 * their preset variable.
	 *
	 * @return array<int, array{name: string, slug: string}>
	 */
	private static function fonts(): array {
		if ( ! function_exists( 'wp_get_global_settings' ) ) {
			return array();
		}
		$out = array();
		foreach ( (array) wp_get_global_settings( array( 'typography', 'fontFamilies' ) ) as $origin ) {
			foreach ( (array) $origin as $family ) {
				if ( is_array( $family ) && isset( $family['slug'], $family['name'] ) ) {
					$out[] = array(
						'name' => (string) $family['name'],
						'slug' => (string) $family['slug'],
					);
				}
			}
		}
		return $out;
	}

	public function site(): \WP_REST_Response {
		$theme     = wp_get_theme();
		$pages     = get_posts(
			array(
				'post_type'      => 'page',
				'post_status'    => array( 'publish', 'draft', 'private' ),
				'posts_per_page' => 100,
				'orderby'        => 'menu_order title',
				'order'          => 'ASC',
			)
		);
		$libraries = array();
		$offered   = CodeElement::libraries();
		foreach ( Plugin::shared_data( 'code-libraries' )['libraries'] as $library ) {
			if ( in_array( (string) $library['name'], $offered, true ) ) {
				$libraries[] = array(
					'name'  => (string) $library['name'],
					'about' => (string) $library['about'],
				);
			}
		}
		return rest_ensure_response(
			array(
				'name'          => get_bloginfo( 'name' ),
				'description'   => get_bloginfo( 'description' ),
				'url'           => home_url( '/' ),
				'theme'         => array(
					'name'  => $theme->get( 'Name' ),
					'slug'  => $theme->get_stylesheet(),
					'block' => wp_is_block_theme(),
				),
				'canScript'     => current_user_can( 'unfiltered_html' ),
				'canSetFront'   => current_user_can( 'manage_options' ),
				'frontPage'     => 'page' === get_option( 'show_on_front' ) ? (int) get_option( 'page_on_front' ) : 0,
				'blankTemplate' => wp_is_block_theme() && function_exists( 'register_block_template' ) ? BlankPage::SLUG : '',
				'templates'     => self::page_templates(),
				'parts'         => self::parts(),
				'blocks'        => array_map(
					static fn( $b ) => array_intersect_key( $b, array_flip( array( 'name', 'title', 'category', 'attributes' ) ) ),
					Studio::block_types()
				),
				'libraries'     => $libraries,
				'designBrief'   => mb_substr( \Auvyx\Builder\Modules\DesignSystem\Brief::brief(), 0, 12000 ),
				'woocommerce'   => class_exists( 'WooCommerce' ),
				'fonts'         => self::fonts(),
				'vibe'          => (string) get_option( self::VIBE_OPTION, '' ),
				'scopes'        => McpAccess::scopes(),
				'extensions'    => Rules::extensions(),
				'pages'         => array_map(
					static fn( \WP_Post $p ) => array(
						'id'       => $p->ID,
						'title'    => $p->post_title,
						'status'   => $p->post_status,
						'template' => (string) get_page_template_slug( $p ),
						'link'     => (string) get_permalink( $p ),
					),
					$pages
				),
			)
		);
	}

	/**
	 * Page templates a page may use: the theme's and the plugin's (the blank one).
	 *
	 * @return array<int, array{slug: string, title: string}>
	 */
	public static function page_templates(): array {
		$out = array();
		foreach ( wp_get_theme()->get_page_templates( null, 'page' ) as $slug => $title ) {
			$out[ (string) $slug ] = (string) $title;
		}
		if ( function_exists( 'get_block_templates' ) && wp_is_block_theme() ) {
			foreach ( get_block_templates( array( 'post_type' => 'page' ) ) as $template ) {
				if ( ! isset( $out[ $template->slug ] ) ) {
					$out[ $template->slug ] = (string) $template->title;
				}
			}
		}
		$list = array(
			array(
				'slug'  => '',
				'title' => __( 'Default (the theme\'s page template)', 'auvyx-builder' ),
			),
		);
		foreach ( $out as $slug => $title ) {
			$list[] = array(
				'slug'  => $slug,
				'title' => $title,
			);
		}
		return $list;
	}

	/**
	 * The theme's template parts (header, footer…), which a page may show with a `core/template-part` block.
	 *
	 * @return array<int, array{slug: string, title: string, area: string}>
	 */
	private static function parts(): array {
		if ( ! function_exists( 'get_block_templates' ) || ! wp_is_block_theme() ) {
			return array();
		}
		$out = array();
		foreach ( get_block_templates( array(), 'wp_template_part' ) as $part ) {
			$out[] = array(
				'slug'  => (string) $part->slug,
				'title' => (string) $part->title,
				'area'  => (string) $part->area,
			);
		}
		return $out;
	}

	public function document( \WP_REST_Request $request ) {
		$post = get_post( (int) $request['id'] );
		if ( ! $post instanceof \WP_Post ) {
			return new \WP_Error( 'auvyx_not_found', __( 'No such post.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		$type = get_post_type_object( $post->post_type );
		return rest_ensure_response(
			array(
				'id'       => $post->ID,
				'type'     => $post->post_type,
				'restBase' => $type && $type->rest_base ? $type->rest_base : $post->post_type,
				'title'    => $post->post_title,
				'status'   => $post->post_status,
				'template' => (string) get_page_template_slug( $post ),
				'link'     => (string) get_permalink( $post ),
				'version'  => Writes::version( $post ),
				'pending'  => null !== Pending::get( $post->ID ),
				'blocks'   => Studio::tree( parse_blocks( $post->post_content ) ),
			)
		);
	}

	/**
	 * `POST auvyx/v1/mcp/pages` {title, slug?, template?, content?}: a new page, always a draft (publishing is a save with
	 * `status: publish`). Content, when given, goes through the same safe save (code waits).
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create_page( \WP_REST_Request $request ) {
		$template = (string) $request['template'];
		if ( '' !== $template && ! in_array( $template, array_column( self::page_templates(), 'slug' ), true ) ) {
			return new \WP_Error( 'auvyx_mcp_template', __( 'No such page template.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$data = array(
			'post_type'   => 'page',
			'post_status' => 'draft',
			'post_title'  => sanitize_text_field( (string) $request['title'] ),
		);
		if ( '' !== (string) $request['slug'] ) {
			$data['post_name'] = sanitize_title( (string) $request['slug'] );
		}
		if ( '' !== $template ) {
			$data['page_template'] = $template;
		}
		$id = wp_insert_post( wp_slash( $data ), true );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$post = get_post( $id );
		$out  = array(
			'id'       => $id,
			'link'     => (string) get_permalink( $id ),
			'status'   => 'draft',
			'template' => (string) get_page_template_slug( $id ),
			'version'  => Writes::version( $post ),
		);
		if ( '' !== (string) $request['content'] ) {
			$saved = Writes::save( $post, array( 'content' => (string) $request['content'] ) );
			if ( is_wp_error( $saved ) ) {
				return $saved;
			}
			$out = array_merge( $out, $saved );
		}
		$response = rest_ensure_response( $out );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * `POST auvyx/v1/mcp/save/{id}` {content, version, title?, status?, template?}: 409 when the page changed since it was
	 * read; otherwise Writes::save (drafts by default, a revision, code waits).
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save( \WP_REST_Request $request ) {
		$post    = get_post( (int) $request['id'] );
		$current = Writes::version( $post );
		if ( ! hash_equals( $current, (string) $request['version'] ) ) {
			return new \WP_Error(
				'auvyx_mcp_conflict',
				__( 'The page changed since you read it. Read it again and redo your change.', 'auvyx-builder' ),
				array(
					'status'  => 409,
					'version' => $current,
				)
			);
		}
		$args = array( 'content' => (string) $request['content'] );
		foreach ( array( 'title', 'status', 'template' ) as $key ) {
			if ( null !== $request[ $key ] ) {
				$args[ $key ] = (string) $request[ $key ];
			}
		}
		$saved = Writes::save( $post, $args );
		return is_wp_error( $saved ) ? $saved : rest_ensure_response( $saved );
	}

	public function revisions( \WP_REST_Request $request ): \WP_REST_Response {
		$post = get_post( (int) $request['id'] );
		return rest_ensure_response(
			array(
				'id'        => $post->ID,
				'revisions' => Writes::revisions( $post ),
			)
		);
	}

	/**
	 * `POST auvyx/v1/mcp/restore/{id}` {revision}: saves that revision's content again, by the same rules as a save (on a
	 * published page it goes live only with `publish`; otherwise into the autosave).
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function restore( \WP_REST_Request $request ) {
		$post     = get_post( (int) $request['id'] );
		$revision = get_post( (int) $request['revision'] );
		if ( ! $revision instanceof \WP_Post || 'revision' !== $revision->post_type || (int) $revision->post_parent !== $post->ID ) {
			return new \WP_Error( 'auvyx_mcp_revision', __( 'No such revision of this page.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		$saved = Writes::save(
			$post,
			array(
				'content' => $revision->post_content,
				'title'   => $revision->post_title,
				'status'  => Writes::is_live( $post ) ? $post->post_status : '',
			)
		);
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		$saved['restored'] = $revision->ID;
		return rest_ensure_response( $saved );
	}

	/**
	 * `POST auvyx/v1/mcp/trash/{id}`: to the trash, never deleted for good.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function trash( \WP_REST_Request $request ) {
		$id = (int) $request['id'];
		if ( 'trash' !== get_post_status( $id ) && ! wp_trash_post( $id ) ) {
			return new \WP_Error( 'auvyx_mcp_trash', __( 'The page could not be moved to the trash.', 'auvyx-builder' ), array( 'status' => 500 ) );
		}
		return rest_ensure_response(
			array(
				'id'     => $id,
				'status' => 'trash',
			)
		);
	}

	public function front_page( \WP_REST_Request $request ) {
		$id   = (int) $request['id'];
		$post = get_post( $id );
		if ( ! $post instanceof \WP_Post || 'page' !== $post->post_type ) {
			return new \WP_Error( 'auvyx_not_found', __( 'No such page.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $id );
		return rest_ensure_response( array( 'frontPage' => $id ) );
	}

	/**
	 * A link that shows a draft for a few minutes to whoever has it (the MCP server's browser, which has no login): the
	 * AI looks at what it built before it publishes.
	 */
	public function preview_link( \WP_REST_Request $request ) {
		$id       = (int) $request['id'];
		$autosave = wp_get_post_autosave( $id, get_current_user_id() );
		$post     = get_post( $id );
		// A published page's MCP edits live in the autosave: the link shows that (a draft shows its own content).
		$show_autosave = $post instanceof \WP_Post && Writes::is_live( $post ) && $autosave instanceof \WP_Post;
		return rest_ensure_response(
			array(
				'url'     => self::preview_url( $id, $show_autosave ),
				'expires' => self::PREVIEW_TTL,
			)
		);
	}

	/**
	 * A preview link for a page: its draft, or (`$autosave`) the current user's autosave of it.
	 */
	public static function preview_url( int $id, bool $autosave = false ): string {
		$token = strtolower( wp_generate_password( 32, false, false ) ); // sanitize_key keeps it as is
		$saved = $autosave ? wp_get_post_autosave( $id, get_current_user_id() ) : false;
		set_transient(
			'auvyx_mcp_preview_' . $token,
			$saved instanceof \WP_Post ? array(
				'id'  => $id,
				'rev' => $saved->ID,
			) : $id,
			self::PREVIEW_TTL
		);
		$post = get_post( $id );
		$arg  = $post instanceof \WP_Post && 'page' === $post->post_type ? 'page_id' : 'p';
		return add_query_arg(
			array(
				$arg              => $id,
				self::PREVIEW_ARG => $token,
			),
			home_url( '/' )
		);
	}

	/**
	 * The main query of a preview link shows its draft as if published (in this request only).
	 *
	 * @param \WP_Post[] $posts Found.
	 * @param \WP_Query  $query The query.
	 * @return \WP_Post[]
	 */
	public function preview( array $posts, \WP_Query $query ): array {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a capability link, checked against its stored token
		$token = isset( $_GET[ self::PREVIEW_ARG ] ) ? sanitize_key( wp_unslash( $_GET[ self::PREVIEW_ARG ] ) ) : '';
		if ( '' === $token || ! $query->is_main_query() || 1 !== count( $posts ) ) {
			return $posts;
		}
		$link = get_transient( 'auvyx_mcp_preview_' . $token );
		$id   = is_array( $link ) ? (int) ( $link['id'] ?? 0 ) : (int) $link;
		if ( $id <= 0 || (int) $posts[0]->ID !== $id ) {
			return $posts;
		}
		$revision = is_array( $link ) ? get_post( (int) ( $link['rev'] ?? 0 ) ) : null;
		if ( $revision instanceof \WP_Post && 'revision' === $revision->post_type && (int) $revision->post_parent === $id ) {
			$posts[0]               = clone $posts[0];
			$posts[0]->post_content = $revision->post_content;
			$posts[0]->post_title   = $revision->post_title;
			nocache_headers();
		} elseif ( in_array( $posts[0]->post_status, array( 'draft', 'pending', 'future', 'private' ), true ) ) {
			$posts[0]->post_status = 'publish';
			nocache_headers();
		}
		return $posts;
	}
}
