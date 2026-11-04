<?php
/**
 * DEPRECATED as an editor: the Scala.js Auvyx Studio (apps/studio) is no longer Auvyx Builder's editor. Auvyx Editor
 * (Svelte, apps/editor, Modules/Editor) is the only editor; the Studio bundle is not shipped, and
 * post.php?post=ID&action=auvyx-studio redirects to Auvyx Editor so old links and bookmarks keep working.
 *
 * What stays here, under the Studio's name, is the editors' shared backend (ADR 0020), which Auvyx Editor uses:
 * - admin menu "Auvyx Builder": Pages, Components, Design system, Settings (pages in Admin.php);
 * - load: parse_blocks() → JSON tree (tree()); Auvyx blocks become editable elements, other blocks stay verbatim;
 * - config(): what the editor starts from; save: the editor posts native block markup to the REST API;
 * - canvas: the real frontend page, content replaced by a marker (canvas mode of the VisualBuilder module).
 * Pages the Studio saved are ordinary block markup: they render and open in Auvyx Editor unchanged.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Components\Components;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;
use Auvyx\Builder\Modules\StudioExtensions\StudioExtensions;
use Auvyx\Builder\Modules\VisualBuilder\VisualBuilder;

defined( 'ABSPATH' ) || exit;

/**
 * The editors' shared backend (see the file header).
 *
 * @deprecated 1.0.0 The Auvyx Studio editor page (`action=auvyx-studio`, render(), available()) is deprecated in favour of
 *             Auvyx Editor (Modules/Editor). The rest of this class is the backend Auvyx Editor runs on and is not deprecated.
 */
final class Studio implements Module {

	/** Block context of a single render (`rest_render` inside a loop); null elsewhere. @var array<string, mixed>|null */
	private static $context = null;

	/**
	 * Runs `$build` with a block context for the WordPress blocks it renders (a part's preview product).
	 *
	 * @param array<string, mixed> $context Block context.
	 * @param callable             $build   What to run.
	 * @return mixed
	 */
	public static function with_context( array $context, callable $build ) {
		$saved         = self::$context;
		self::$context = $context;
		try {
			return $build();
		} finally {
			self::$context = $saved;
		}
	}


	/** @deprecated 1.0.0 The Studio's address: it redirects to Auvyx Editor (Editor::ACTION). */
	const ACTION   = 'auvyx-studio';
	const MENU     = 'auvyx-builder';
	const SETTINGS = 'auvyx_builder_settings';
	const BLOCKS   = array( 'auvyx/section', 'auvyx/heading', 'auvyx/text', 'auvyx/snippet', 'auvyx/button', 'auvyx/image', 'auvyx/icon', 'auvyx/divider', 'auvyx/video', 'auvyx/vector', 'auvyx/accordion', 'auvyx/loop', 'auvyx/carousel', 'auvyx/nav' );
	/** Auvyx blocks whose inner blocks are Studio children. */
	const CONTAINERS = array( 'auvyx/section', 'auvyx/accordion', 'auvyx/loop' );

	/** @var DesignSystem */
	private $design_system;

	/** @var Components */
	private $components;

	public function __construct( DesignSystem $design_system, Components $components ) {
		$this->design_system = $design_system;
		$this->components    = $components;
	}

	public function id(): string {
		return 'studio';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		( new MenuBuilder() )->register();
		( new Library() )->register();
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		// Old Studio links (bookmarks, emails, other plugins) open Auvyx Editor; its row action is the way in (Modules/Editor).
		add_action( 'post_action_' . self::ACTION, array( $this, 'render' ) );
		add_action( 'admin_bar_menu', array( $this, 'admin_bar' ), 81 );
		add_filter( 'auvyx_builder_post_types', array( $this, 'enabled_post_types' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	// ---- post lock (like the block editor's "X is currently editing") -------------------

	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			'/studio/dismiss-autosave/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_dismiss_autosave' ),
				'permission_callback' => static function ( \WP_REST_Request $request ) {
					return current_user_can( 'edit_post', (int) $request['id'] );
				},
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/lock/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_lock' ),
				'permission_callback' => static function ( \WP_REST_Request $request ) {
					return current_user_can( 'edit_post', (int) $request['id'] );
				},
				'args'                => array(
					'takeover' => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/convert',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_convert' ),
				// Converting renders the blocks for their preview: only for someone who can edit the post they come from.
				'permission_callback' => static function ( \WP_REST_Request $request ) {
					return current_user_can( 'edit_post', (int) $request->get_param( 'post' ) );
				},
				'args'                => array(
					'markup' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/render',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_render' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_posts' );
				},
				'args'                => array(
					'block' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
	}

	/**
	 * A note for pages WordPress or WooCommerce treat specially (their content is not what the visitor sees, or part of
	 * it is an app): text and an optional link, shown above the canvas.
	 *
	 * @return array{text: string, link: string, label: string}|null
	 */
	/**
	 * Where the shop catalog is edited: the template part the shop template shows, in Studio (the Site Editor's
	 * template when the theme has no such part, nothing for classic themes).
	 */
	private static function catalog_link( string $theme ): string {
		if ( ! wp_is_block_theme() ) {
			return '';
		}
		$template = get_block_template( $theme . '//archive-product' );
		if ( $template && preg_match_all( '/<!-- wp:template-part \{[^}]*"slug":"([a-z0-9-]+)"/', (string) $template->content, $m ) ) {
			foreach ( $m[1] as $slug ) {
				$part = get_block_template( $theme . '//' . $slug, 'wp_template_part' );
				if ( $part && ! in_array( $part->area, array( 'header', 'footer' ), true ) ) {
					return add_query_arg( '_wpnonce', wp_create_nonce( 'auvyx-edit-part' ), admin_url( 'admin.php?page=' . self::MENU . '-parts&part=' . rawurlencode( $part->id ) ) );
				}
			}
		}
		return admin_url( 'site-editor.php?p=' . rawurlencode( '/wp_template/' . $theme . '//archive-product' ) . '&canvas=edit' );
	}

	/**
	 * Above a component's canvas: everything it changes, so nobody edits the site's header thinking it is one page's.
	 *
	 * @return array{text: string, link: string, label: string}
	 */
	private static function component_note( int $id ): array {
		$type = \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::type_of( $id );
		if ( '' !== $type ) {
			$summary = \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::state( $id )['summary'];
			$name    = 'footer' === $type ? __( 'footer', 'auvyx-builder' ) : __( 'header', 'auvyx-builder' );
			return array(
				'text'  => '' !== $summary
					/* translators: 1: header or footer, 2: where it shows, in words */
					? sprintf( __( 'This %1$s shows on: %2$s. What you change here shows there.', 'auvyx-builder' ), $name, $summary )
					/* translators: %s: header or footer */
					: sprintf( __( 'This %s has no display conditions yet, so it shows nowhere. Publish it to choose where.', 'auvyx-builder' ), $name ),
				'link'  => admin_url( 'admin.php?page=' . self::MENU . '-parts' ),
				'label' => __( 'Theme Builder', 'auvyx-builder' ),
			);
		}
		$components = \Auvyx\Builder\Plugin::instance()->module( 'components' );
		$uses       = $components instanceof \Auvyx\Builder\Modules\Components\Components ? $components->uses( $id ) : array();
		$where      = admin_url( 'admin.php?page=' . self::MENU . '-components' );
		if ( ! $uses ) {
			return array(
				'text'  => __( 'A shared component. It shows nowhere yet: insert it in a page (Assets → Your patterns & components), or choose where it shows.', 'auvyx-builder' ),
				'link'  => $where,
				'label' => __( 'Choose where it shows', 'auvyx-builder' ),
			);
		}
		return array(
			/* translators: %s: where the component shows ("as the site's header; under the header, on every page") */
			'text'  => sprintf( __( 'A shared component: what you change here shows %s.', 'auvyx-builder' ), implode( '; ', $uses ) ),
			'link'  => $where,
			'label' => __( 'Where it shows', 'auvyx-builder' ),
		);
	}

	public static function page_note( \WP_Post $post ): ?array {
		if ( 'wp_block' === $post->post_type && Library::synced( (int) $post->ID ) ) {
			return self::component_note( (int) $post->ID );
		}
		if ( 'page' !== $post->post_type ) {
			return null;
		}
		$id = (int) $post->ID;
		if ( (int) get_option( 'page_for_posts' ) === $id ) {
			return array(
				'text'  => __( 'This is the posts page: the theme shows the latest posts here, not this page\'s content.', 'auvyx-builder' ),
				'link'  => '',
				'label' => '',
			);
		}
		if ( ! function_exists( 'wc_get_page_id' ) ) {
			return null;
		}
		$theme = get_stylesheet();
		if ( wc_get_page_id( 'shop' ) === $id ) {
			return array(
				'text'  => __( 'This is the WooCommerce Shop page: visitors see the product catalog template here, not this page\'s content.', 'auvyx-builder' ),
				'link'  => self::catalog_link( $theme ),
				'label' => __( 'Edit the shop catalog', 'auvyx-builder' ),
			);
		}
		foreach ( array(
			'cart'      => __( 'This is the Cart page. The cart itself is a WooCommerce app, rendered for each visitor: add content around it here, edit its sections in the block editor.', 'auvyx-builder' ),
			'checkout'  => __( 'This is the Checkout page. The checkout form is a WooCommerce app, rendered for each visitor: add content around it here, edit its fields in the block editor.', 'auvyx-builder' ),
			'myaccount' => __( 'This is the My account page. WooCommerce shows each customer their own account here.', 'auvyx-builder' ),
		) as $page => $text ) {
			if ( wc_get_page_id( $page ) === $id ) {
				return array(
					'text'  => $text,
					'link'  => (string) get_edit_post_link( $id, 'raw' ),
					'label' => __( 'Open in the block editor', 'auvyx-builder' ),
				);
			}
		}
		return null;
	}

	/**
	 * Core blocks → Auvyx elements (Convert), returned as Studio tree nodes.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function rest_convert( $request ): \WP_REST_Response {
		$markup = (string) $request->get_param( 'markup' );
		if ( strlen( $markup ) > 200000 ) {
			return new \WP_REST_Response( array( 'message' => __( 'This block is too large to convert here.', 'auvyx-builder' ) ), 413 );
		}
		// The converted blocks render as they show: in a template part, with its preview item and page query.
		$post = get_post( (int) $request->get_param( 'post' ) );
		// keep: render the markup as it is (a block whose attributes changed), without turning it into Auvyx elements.
		$keep               = (bool) $request->get_param( 'keep' );
		$build              = static fn() => self::tree( $keep ? parse_blocks( $markup ) : Convert::blocks( parse_blocks( $markup ) ) );
		list( $tree, $css ) = self::with_styles( $post && 'wp_template_part' === $post->post_type ? static fn() => Parts::with_preview( $post, $build ) : $build );
		return new \WP_REST_Response(
			array(
				'blocks' => $tree,
				'styles' => $css,
			)
		);
	}

	/**
	 * The theme's own styles (Global Styles: presets, element and block styles, fonts) for Studio's thumbnails and
	 * standalone canvas, so kits preview with the site's look.
	 */
	public static function theme_css(): string {
		$css = function_exists( 'wp_get_global_stylesheet' ) ? (string) wp_get_global_stylesheet() : '';
		if ( function_exists( 'wp_print_font_faces' ) ) {
			ob_start();
			wp_print_font_faces();
			$css .= wp_strip_all_tags( (string) ob_get_clean() );
		}
		return $css . \Auvyx\Builder\Modules\Blocks\Blocks::theme_button_css();
	}

	/**
	 * The active theme's palette and font sizes (style variation and user changes included), for the AI agent.
	 *
	 * @return array{colors: array<int, array<string, string>>, fontSizes: array<int, array<string, string>>}
	 */
	public static function theme_presets(): array {
		$pick    = static function ( $list, string $value ): array {
			$out = array();
			foreach ( is_array( $list ) ? $list : array() as $item ) {
				if ( isset( $item['slug'], $item[ $value ] ) && is_scalar( $item[ $value ] ) ) {
					$out[] = array(
						'slug'  => sanitize_key( $item['slug'] ),
						'name'  => (string) ( $item['name'] ?? $item['slug'] ),
						'value' => (string) $item[ $value ],
					);
				}
			}
			return $out;
		};
		$palette = wp_get_global_settings( array( 'color', 'palette' ) );
		$sizes   = wp_get_global_settings( array( 'typography', 'fontSizes' ) );
		return array(
			'colors'    => $pick( $palette['theme'] ?? array(), 'color' ),
			'fontSizes' => $pick( $sizes['theme'] ?? array(), 'size' ),
		);
	}

	/**
	 * Sections the theme and plugins offer as patterns (the AI agent inserts them by slug; they arrive as Auvyx elements):
	 * the active theme's, then those in section-like categories. Hidden ones (Inserter: no) and template-only ones
	 * (header, footer, block types) are left out.
	 *
	 * @return array<int, array{slug: string, title: string, description: string}>
	 */
	public static function patterns(): array {
		$theme = get_stylesheet() . '/';
		$out   = array();
		foreach ( \WP_Block_Patterns_Registry::get_instance()->get_all_registered() as $pattern ) {
			$slug = (string) ( $pattern['name'] ?? '' );
			$cats = (array) ( $pattern['categories'] ?? array() );
			if ( false === ( $pattern['inserter'] ?? true ) || ! empty( $pattern['blockTypes'] ) || array_intersect( $cats, array( 'header', 'footer' ) ) ) {
				continue;
			}
			if ( 0 === strpos( $slug, 'auvyx-builder/' ) ) {
				continue; // Auvyx Builder's own sections are the Studio kits, which the agent gets as such.
			}
			$ours = 0 === strpos( $slug, $theme ) ? 2 : ( 0 === strpos( $slug, 'auvyx-' ) ? 1 : 0 );
			if ( ! $ours && ! array_intersect( $cats, array( 'auvyx-store', 'featured', 'banner', 'call-to-action', 'about', 'testimonials', 'gallery', 'services', 'team', 'text' ) ) ) {
				continue;
			}
			$out[] = array(
				'slug'        => $slug,
				'title'       => wp_strip_all_tags( (string) ( $pattern['title'] ?? $slug ) ),
				'description' => wp_html_excerpt( wp_strip_all_tags( (string) ( $pattern['description'] ?? '' ) ), 140, '…' ),
				'ours'        => $ours,
			);
		}
		usort( $out, static fn( $a, $b ) => $b['ours'] - $a['ours'] );
		return array_map(
			static function ( $p ) {
				unset( $p['ours'] );
				return $p;
			},
			array_slice( $out, 0, 60 )
		);
	}

	/** Names of core blocks Auvyx Studio can turn into its own elements. */
	public static function convertible(): array {
		return Convert::BLOCKS;
	}

	/** Attributes the Studio can edit as plain controls; the rest keep their defaults. */
	const SKIP_ATTRIBUTES = array( 'lock', 'metadata', 'className', 'style', 'anchor', 'align', 'fontSize', 'fontFamily', 'textColor', 'backgroundColor', 'borderColor', 'gradient', 'layout', 'tagName' );

	/**
	 * Dynamic blocks Auvyx Studio can insert: rendered by the server from attributes alone (core widgets-like blocks,
	 * WooCommerce and other plugins' blocks). Blocks whose content lives in saved HTML (attributes with a `source`),
	 * child-only blocks and blocks hidden from the inserter are left out.
	 *
	 * @return array<int, array{name: string, title: string, category: string, attributes: array<int, array<string, mixed>>}>
	 */
	public static function block_types(): array {
		$skip = array( 'core/block', 'core/template-part', 'core/pattern', 'core/post-content', 'core/legacy-widget', 'core/widget-group', 'core/query', 'core/post-template', 'core/comments', 'core/navigation', 'core/shortcode' );
		$out  = array();
		foreach ( \WP_Block_Type_Registry::get_instance()->get_all_registered() as $type ) {
			if ( ! $type->is_dynamic() || ( 0 === strpos( $type->name, 'auvyx/' ) && 'auvyx/form' !== $type->name && ! in_array( $type->name, \Auvyx\Builder\Modules\Widgets\Widgets::BLOCKS, true ) ) || in_array( $type->name, $skip, true ) || ! empty( $type->parent ) || ! empty( $type->ancestor ) || false === ( $type->supports['inserter'] ?? true ) ) {
				continue;
			}
			$attributes = array();
			$sourced    = false;
			foreach ( (array) $type->attributes as $name => $schema ) {
				if ( isset( $schema['source'] ) ) {
					$sourced = true;
					break;
				}
				$kind = $schema['type'] ?? '';
				if ( in_array( $name, self::SKIP_ATTRIBUTES, true ) || ! in_array( $kind, array( 'string', 'number', 'integer', 'boolean' ), true ) ) {
					continue;
				}
				$attributes[] = array_filter(
					array(
						'name'    => (string) $name,
						'type'    => $kind,
						'enum'    => isset( $schema['enum'] ) && is_array( $schema['enum'] ) ? array_values( array_map( 'strval', $schema['enum'] ) ) : null,
						'default' => isset( $schema['default'] ) && is_scalar( $schema['default'] ) ? $schema['default'] : null,
					),
					static function ( $v ) {
						return null !== $v;
					}
				);
			}
			if ( $sourced ) {
				continue; // its content is saved HTML, which only the block editor can write
			}
			$item   = array(
				'name'       => $type->name,
				'title'      => '' !== (string) $type->title ? (string) $type->title : $type->name,
				'category'   => (string) $type->category,
				'attributes' => array_slice( $attributes, 0, 24 ),
			);
			$design = self::design( $type );
			if ( null !== $design ) {
				$item['design'] = $design;
			}
			$out[] = $item;
		}
		usort(
			$out,
			static function ( $a, $b ) {
				return strcmp( $a['title'], $b['title'] );
			}
		);
		return $out;
	}

	/**
	 * Blocks that opt into Auvyx styling (`supports.auvyx`, ADR 0036): Auvyx Studio edits their `auvyx.styles` like an Auvyx
	 * element's, plus the design properties they declare — CSS custom properties their own CSS reads
	 * (`{"name": "--auvyx-option-bg", "label": "Option background", "type": "color", "group": "Options"}`).
	 *
	 * @param \WP_Block_Type $type Block type.
	 * @return array<int, array{name: string, label: string, type: string, group: string}>|null Null: not styleable.
	 */
	public static function design( $type ): ?array {
		$auvyx = $type->supports['auvyx'] ?? null;
		if ( true !== $auvyx && ! is_array( $auvyx ) ) {
			return null;
		}
		$props = array();
		foreach ( is_array( $auvyx ) ? (array) ( $auvyx['props'] ?? array() ) : array() as $prop ) {
			$name = is_array( $prop ) ? (string) ( $prop['name'] ?? '' ) : '';
			if ( 1 !== preg_match( '/^--[a-z0-9-]{1,60}$/', $name ) ) {
				continue;
			}
			$kind    = (string) ( $prop['type'] ?? 'text' );
			$props[] = array(
				'name'  => $name,
				'label' => (string) ( $prop['label'] ?? $name ),
				'type'  => in_array( $kind, array( 'color', 'length', 'text' ), true ) ? $kind : 'text',
				'group' => (string) ( $prop['group'] ?? '' ),
			);
		}
		return array_slice( $props, 0, 60 );
	}

	/**
	 * One dynamic block (by name, with attributes the Studio can edit) as a Studio element with its server-rendered
	 * preview, plus the style tags it needs on the canvas.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_render( $request ) {
		$name  = (string) $request->get_param( 'block' );
		$types = array_column( self::block_types(), null, 'name' );
		if ( ! isset( $types[ $name ] ) ) {
			return new \WP_Error( 'auvyx_unknown_block', __( 'This block cannot be inserted from the Auvyx editor.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$given = (array) $request->get_param( 'attrs' );
		// Inside a Posts loop, the block previews with the loop's first post (a product card's own product).
		$post_id = (int) $request->get_param( 'postId' );
		$context = $post_id && current_user_can( 'read_post', $post_id ) ? array(
			'postId'   => $post_id,
			'postType' => (string) get_post_type( $post_id ),
		) : null;
		$attrs   = array();
		foreach ( $types[ $name ]['attributes'] as $schema ) {
			$key = $schema['name'];
			if ( ! array_key_exists( $key, $given ) || ! is_scalar( $given[ $key ] ) ) {
				continue;
			}
			$value = $given[ $key ];
			switch ( $schema['type'] ) {
				case 'boolean':
					$value = (bool) $value;
					break;
				case 'integer':
					$value = (int) $value;
					break;
				case 'number':
					$value = (float) $value;
					break;
				default:
					$value = sanitize_text_field( (string) $value );
			}
			if ( isset( $schema['enum'] ) && ! in_array( (string) $value, $schema['enum'], true ) ) {
				continue;
			}
			if ( ! array_key_exists( 'default', $schema ) || (string) wp_json_encode( $schema['default'] ) !== (string) wp_json_encode( 'number' === $schema['type'] && floor( (float) $value ) === (float) $value ? (int) $value : $value ) ) {
				$attrs[ $key ] = $value;
			}
		}
		$block         = array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => '',
			'innerContent' => array(),
		);
		self::$context = $context;
		/** True while Auvyx Studio renders a block for its canvas: plugins may show sample data. */
		add_filter( 'auvyx_builder_is_preview', '__return_true' );
		list( $tree, $css ) = self::with_styles( static fn() => self::tree( array( $block ) ) );
		remove_filter( 'auvyx_builder_is_preview', '__return_true' );
		self::$context = null;
		return new \WP_REST_Response(
			array(
				'blocks' => $tree,
				'styles' => $css,
			)
		);
	}

	/**
	 * Refreshes the edit lock (Studio heartbeat). Returns who holds it when another user does.
	 *
	 * @return array{locked: bool, by: string}
	 */
	public static function lock( int $post_id, bool $takeover = false ): array {
		require_once ABSPATH . 'wp-admin/includes/post.php';
		$holder = wp_check_post_lock( $post_id );
		if ( $holder && ! $takeover ) {
			$user = get_userdata( (int) $holder );
			return array(
				'locked' => true,
				'by'     => $user ? $user->display_name : __( 'Another user', 'auvyx-builder' ),
			);
		}
		wp_set_post_lock( $post_id );
		return array(
			'locked' => false,
			'by'     => '',
		);
	}

	/** Deletes the current user's newer autosave revision so Studio opens on live content only. */
	public function rest_dismiss_autosave( \WP_REST_Request $request ): \WP_REST_Response {
		$post_id  = (int) $request['id'];
		$autosave = wp_get_post_autosave( $post_id, get_current_user_id() );
		if ( $autosave instanceof \WP_Post ) {
			wp_delete_post_revision( (int) $autosave->ID );
		}
		return new \WP_REST_Response( array( 'ok' => true ) );
	}

	public function rest_lock( \WP_REST_Request $request ): \WP_REST_Response {
		return new \WP_REST_Response( self::lock( (int) $request['id'], (bool) $request['takeover'] ) );
	}

	/** `$value` unless empty. */
	private static function or_default( string $value, string $fallback ): string {
		return '' === $value ? $fallback : $value;
	}

	/**
	 * Whether the Auvyx Studio editor can open: never any more (the Studio is deprecated and its bundle is not shipped).
	 *
	 * @deprecated 1.0.0 Auvyx Editor is the only editor: Editor::available().
	 */
	public static function available(): bool {
		return false;
	}

	/**
	 * Whether a document opens in Auvyx Editor: always (the Studio is deprecated). Kept for add-ons that call it.
	 *
	 * @deprecated 1.0.0 Auvyx Editor is the only editor.
	 */
	public static function uses_editor(): bool {
		return true;
	}

	/** Where a document is edited: Auvyx Editor (`action=auvyx-editor`). */
	public static function url( int $post_id ): string {
		return \Auvyx\Builder\Modules\Editor\Editor::url( $post_id );
	}

	// ---- settings -------------------------------------------------------------------

	/**
	 * The builder's settings. `editor` is always "editor" now: the choice between Auvyx Editor and the deprecated Studio is
	 * gone (a saved "studio" is ignored).
	 *
	 * @return array{post_types: string[], editor: string}
	 */
	public static function settings(): array {
		$saved = get_option( self::SETTINGS, array() );
		$types = is_array( $saved ) && isset( $saved['post_types'] ) && is_array( $saved['post_types'] ) ? $saved['post_types'] : array( 'page', 'post' );
		return array(
			'post_types' => array_values( array_filter( array_map( 'sanitize_key', $types ) ) ),
			'editor'     => 'editor',
		);
	}

	/**
	 * Whether the current user may open Auvyx Studio (and the builder): administrators always; others unless a role manager
	 * (Auvyx Builder Pro's) says no. Editing a post still needs `edit_post` as usual.
	 */
	public static function can_use(): bool {
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}
		/**
		 * Whether this user may use Auvyx Studio (Auvyx Builder Pro's role manager).
		 *
		 * @param bool     $can  True.
		 * @param \WP_User $user The user.
		 */
		return (bool) apply_filters( 'auvyx_builder_can_use_studio', true, wp_get_current_user() );
	}

	/**
	 * Enabled post types (+ components, always).
	 *
	 * @param string[] $types Default types.
	 * @return string[]
	 */
	public function enabled_post_types( $types ): array {
		unset( $types );
		// Every way into the Studio and the builder checks these types: none for a role that may not use them.
		if ( is_user_logged_in() && ! self::can_use() ) {
			return array();
		}
		return array_values( array_unique( array_merge( self::settings()['post_types'], array( 'wp_block', 'wp_template_part' ) ) ) );
	}

	public function register_settings(): void {
		register_setting(
			self::MENU,
			self::SETTINGS,
			array(
				'type'              => 'object',
				'sanitize_callback' => static function ( $value ) {
					$types = is_array( $value ) && isset( $value['post_types'] ) ? (array) $value['post_types'] : array();
					// The same types the settings screen offers: content types with the editor, no internal ones.
					$ok = static function ( $type ) {
						return post_type_exists( $type ) && post_type_supports( $type, 'editor' ) && ! in_array( $type, array( 'attachment', 'wp_block', 'wp_navigation', 'wp_template', 'wp_template_part' ), true );
					};
					return array(
						'post_types' => array_values( array_filter( array_map( 'sanitize_key', $types ), $ok ) ),
					);
				},
			)
		);
	}

	// ---- admin menu (pages in Admin) ------------------------------------------------------

	public function menu(): void {
		( new Admin( $this->design_system, $this->components ) )->menu();
	}

	// ---- entry points ------------------------------------------------------------------

	/**
	 * "Edit with Auvyx" in the admin bar on the frontend: Auvyx Editor (the list tables' link is Editor::row_action()).
	 * The node keeps its old id (`auvyx-studio`) for themes that style or move it.
	 *
	 * @param \WP_Admin_Bar $bar Admin bar.
	 */
	public function admin_bar( $bar ): void {
		if ( is_admin() || ! \Auvyx\Builder\Modules\Editor\Editor::available() || ! is_singular( VisualBuilder::post_types() ) || ! current_user_can( 'edit_post', get_queried_object_id() ) ) {
			return;
		}
		$bar->add_node(
			array(
				'id'    => 'auvyx-studio',
				'title' => esc_html__( 'Edit with Auvyx', 'auvyx-builder' ),
				'href'  => self::url( get_queried_object_id() ),
			)
		);
	}

	// ---- payload --------------------------------------------------------------------------

	/**
	 * parse_blocks() → the Studio's tree. Auvyx blocks become editable elements; everything else is kept verbatim
	 * (serialized markup) with its rendered HTML as a canvas preview.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, array<string, mixed>>
	 */
	public static function tree( array $blocks ): array {
		$out = array();
		foreach ( $blocks as $block ) {
			$name = $block['blockName'];
			if ( null === $name ) {
				if ( '' !== trim( (string) $block['innerHTML'] ) ) {
					$out[] = array(
						'block' => 'core/freeform',
						'raw'   => (string) $block['innerHTML'],
						'html'  => (string) $block['innerHTML'],
					);
				}
				continue;
			}
			if ( ! in_array( $name, self::BLOCKS, true ) ) {
				$item = array(
					'block' => $name,
					'raw'   => serialize_block( $block ),
					'html'  => Preview::html( $block, null === self::$context ? render_block( $block ) : ( new \WP_Block( $block, self::$context ) )->render() ),
				);
				$type = \WP_Block_Type_Registry::get_instance()->get_registered( $name );
				if ( $type && null !== self::design( $type ) && empty( $block['innerBlocks'] ) ) {
					// Styleable block: its Auvyx styles are edited in Studio, which writes them back into the comment.
					$item['styles'] = $block['attrs']['auvyx']['styles'] ?? null;
					unset( $block['attrs']['auvyx'] );
					$item['raw'] = serialize_block( $block );
				}
				$out[] = $item;
				continue;
			}
			$attrs               = $block['attrs'];
			$html                = (string) $block['innerHTML'];
			list( $text, $href ) = self::inner( $html );
			$src                 = '';
			$alt                 = '';
			if ( 'auvyx/image' === $name ) {
				$href = preg_match( '#<a\b[^>]*\shref="([^"]*)"#i', $html, $m ) ? html_entity_decode( $m[1], ENT_QUOTES ) : '';
			}
			if ( 'auvyx/icon' === $name ) {
				$href = (string) ( $attrs['href'] ?? '' );
			}
			if ( 'auvyx/image' === $name && preg_match( '#<img\b([^>]*)>#i', $html, $img ) ) {
				$src = preg_match( '#\ssrc="([^"]*)"#i', $img[1], $m ) ? html_entity_decode( $m[1], ENT_QUOTES ) : '';
				$alt = preg_match( '#\salt="([^"]*)"#i', $img[1], $m ) ? html_entity_decode( $m[1], ENT_QUOTES ) : '';
			}
			if ( 'auvyx/accordion' === $name ) {
				$text = preg_match( '#<summary[^>]*>(.*?)</summary>#is', $html, $m ) ? $m[1] : '';
			}
			if ( 'auvyx/video' === $name ) {
				$src = (string) ( $attrs['url'] ?? '' );
			}
			if ( 'auvyx/nav' === $name ) {
				// Studio keeps the menu source in `src` and the toggle breakpoint in `alt`.
				$src = (string) ( $attrs['source'] ?? 'pages' );
				$alt = (string) ( $attrs['toggleAt'] ?? 'mobile' );
			}
			if ( 'auvyx/vector' === $name ) {
				// Studio keeps the path in `src` and the viewBox in `alt` (like the video URL in `src`).
				$src = (string) ( $attrs['path'] ?? '' );
				$alt = (string) ( $attrs['viewBox'] ?? '0 0 100 100' );
			}
			if ( 'auvyx/snippet' === $name ) {
				$text = (string) ( $attrs['code'] ?? '' );
				if ( '' === $text && preg_match( '#<code[^>]*>(.*?)</code>#is', $html, $m ) ) {
					$text = html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES );
				}
				$alt = (string) ( $attrs['language'] ?? 'sql' );
				if ( ! empty( $attrs['theme'] ) && 'light' === $attrs['theme'] ) {
					$attrs['className'] = trim( (string) ( $attrs['className'] ?? '' ) . ' auvyx-snippet--light' );
				} else {
					$attrs['className'] = trim( (string) ( $attrs['className'] ?? '' ) . ' auvyx-snippet--dark' );
				}
			}
			$container = in_array( $name, self::CONTAINERS, true );
			$target    = isset( $attrs['auvyx']['target'] ) ? (string) $attrs['auvyx']['target'] : '';
			if ( '' === $target && 'auvyx/button' === $name && false !== strpos( $html, 'target="_blank"' ) ) {
				$target = '_blank';
			}
			$out[] = array(
				'block'     => $name,
				'styles'    => (object) ( $attrs['auvyx']['styles'] ?? array() ),
				'tag'       => (string) ( $attrs['tagName'] ?? 'section' ),
				'level'     => (int) ( $attrs['level'] ?? 2 ),
				'align'     => (string) ( $attrs['align'] ?? '' ),
				'className' => (string) ( $attrs['className'] ?? '' ),
				'anchor'    => (string) ( $attrs['anchor'] ?? '' ),
				'text'      => 'auvyx/section' === $name ? '' : $text,
				'href'      => in_array( $name, array( 'auvyx/button', 'auvyx/image', 'auvyx/icon' ), true ) ? $href : '',
				'label'     => (string) ( $attrs['auvyx']['label'] ?? '' ),
				'css'       => (string) ( $attrs['auvyx']['css'] ?? '' ),
				'code'      => is_array( $attrs['auvyx']['code'] ?? null ) ? $attrs['auvyx']['code'] : null,
				'game'      => is_string( $attrs['auvyx']['game'] ?? null ) ? $attrs['auvyx']['game'] : '',
				'runtime'   => is_array( $attrs['auvyx']['runtime'] ?? null ) ? $attrs['auvyx']['runtime'] : null,
				'sandbox'   => is_array( $attrs['auvyx']['sandbox'] ?? null ) ? $attrs['auvyx']['sandbox'] : null,
				'defs'      => is_array( $attrs['auvyx']['defs'] ?? null ) ? $attrs['auvyx']['defs'] : null,
				'presets'   => is_array( $attrs['auvyx']['presets'] ?? null ) ? $attrs['auvyx']['presets'] : null,
				'target'    => $target,
				'src'       => $src,
				'alt'       => $alt,
				'icon'      => (string) ( $attrs['icon'] ?? '' ),
				'mediaId'   => (int) ( $attrs['id'] ?? 0 ),
				'bind'      => (object) self::bindings( $attrs ),
				'locked'    => ! empty( $attrs['lock']['move'] ),
				'query'     => (object) ( in_array( $name, array( 'auvyx/loop', 'auvyx/carousel' ), true ) && isset( $attrs['query'] ) && is_array( $attrs['query'] ) ? array_map( array( self::class, 'scalar' ), $attrs['query'] ) : array() ),
				'children'  => $container ? self::tree( $block['innerBlocks'] ) : array(),
			);
		}
		return $out;
	}

	/**
	 * `auvyx/data` bindings of a block: attribute → field key.
	 *
	 * @param array<string, mixed> $attrs Block attributes.
	 * @return array<string, string>
	 */
	private static function bindings( array $attrs ): array {
		$out = array();
		foreach ( (array) ( $attrs['metadata']['bindings'] ?? array() ) as $attr => $binding ) {
			if ( is_array( $binding ) && \Auvyx\Builder\Modules\Data\Data::SOURCE === ( $binding['source'] ?? '' ) && isset( $binding['args']['key'] ) ) {
				$out[ (string) $attr ] = (string) $binding['args']['key'];
			}
		}
		return $out;
	}

	/**
	 * A loop query value as the Studio stores it (strings; booleans as "true"/"false").
	 *
	 * @param mixed $value Value.
	 */
	private static function scalar( $value ): string {
		if ( is_bool( $value ) ) {
			return $value ? 'true' : 'false';
		}
		return is_scalar( $value ) ? (string) $value : '';
	}

	/**
	 * Inner HTML and href of a leaf block's single root element.
	 *
	 * @return array{0: string, 1: string}
	 */
	private static function inner( string $html ): array {
		if ( ! preg_match( '#^\s*<([a-z0-9]+)([^>]*)>(.*)</\1>\s*$#is', $html, $m ) ) {
			return array( '', '' );
		}
		$href = preg_match( '#\shref="([^"]*)"#i', $m[2], $h ) ? html_entity_decode( $h[1], ENT_QUOTES ) : '';
		return array( $m[3], $href );
	}

	/**
	 * Runs a render and returns its result with the CSS it needs on the canvas: the stylesheets it enqueued, and what
	 * WordPress's style engine generated meanwhile (layout of flex and grid groups, block style variations such as an
	 * outline button, element colors). WordPress prints the latter in wp_head/wp_footer of the page that renders, which
	 * for Studio's canvas content is never the case.
	 *
	 * @param callable $render The render.
	 * @return array{0: mixed, 1: string}
	 */
	public static function with_styles( callable $render ): array {
		$styles = wp_styles();
		$before = $styles->queue;
		$store  = class_exists( 'WP_Style_Engine_CSS_Rules_Store' ) ? \WP_Style_Engine_CSS_Rules_Store::get_store( 'block-supports' ) : null;
		$rules  = $store ? array_keys( $store->get_all_rules() ) : array();
		$inline = static function () use ( $styles ): array {
			$after = $styles->get_data( 'block-style-variation-styles', 'after' );
			return is_array( $after ) ? $after : array();
		};
		$was    = count( $inline() );
		$result = $render();
		$css    = '';
		$new    = array_diff( $styles->queue, $before );
		if ( $new ) {
			ob_start();
			$styles->do_items( $new );
			$css = (string) ob_get_clean();
		}
		// Block style variations (an outline button…): WordPress registers their CSS but enqueues it only for a page.
		$variations = array_slice( $inline(), $was );
		if ( $variations ) {
			$css .= '<style class="auvyx-block-variations">' . implode( "\n", $variations ) . '</style>';
		}
		if ( $store ) {
			$added = array_diff_key( $store->get_all_rules(), array_flip( $rules ) );
			if ( $added ) {
				$processor = new \WP_Style_Engine_Processor();
				$processor->add_rules( array_values( $added ) );
				$css .= '<style class="auvyx-block-supports">' . $processor->get_css( array( 'prettify' => false ) ) . '</style>';
			}
		}
		return array( $result, $css );
	}

	/** Whether the Studio may autosave this document through WordPress's autosaves (a post type with revisions in REST). */
	public static function autosaves( \WP_Post $post ): bool {
		$type = get_post_type_object( $post->post_type );
		return 'wp_template_part' !== $post->post_type && $type && $type->show_in_rest && post_type_supports( $post->post_type, 'revisions' );
	}

	/**
	 * The current user's autosave of this post when it is newer than the post: the Studio offers it back.
	 *
	 * @return array{blocks: array<int, mixed>, modified: int}|null
	 */
	public static function pending_autosave( \WP_Post $post ): ?array {
		if ( ! self::autosaves( $post ) ) {
			return null;
		}
		$autosave = wp_get_post_autosave( $post->ID, get_current_user_id() );
		if ( ! $autosave ) {
			return null;
		}
		$at = (int) strtotime( $autosave->post_modified_gmt . ' UTC' );
		if ( $at <= (int) strtotime( $post->post_modified_gmt . ' UTC' ) || $autosave->post_content === $post->post_content ) {
			return null;
		}
		return array(
			'blocks'   => self::tree( parse_blocks( $autosave->post_content ) ),
			'modified' => $at,
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function config( \WP_Post $post ): array {
		$type = get_post_type_object( $post->post_type );
		$part = 'wp_template_part' === $post->post_type ? Parts::template_id( $post ) : '';
		// The canvas never renders the content itself: the styles its WordPress blocks need are collected here.
		$is_part                     = 'wp_template_part' === $post->post_type;
		list( $tree, $block_styles ) = self::with_styles(
			static fn() => $is_part ? Parts::with_preview( $post, static fn() => self::tree( parse_blocks( $post->post_content ) ) ) : self::tree( parse_blocks( $post->post_content ) )
		);
		$config                      = array(
			'postId'           => $post->ID,
			'postType'         => $post->post_type,
			'restRoot'         => esc_url_raw( rest_url() ),
			'restBase'         => $type && $type->rest_base ? $type->rest_base : $post->post_type,
			'nonce'            => wp_create_nonce( 'wp_rest' ),
			'title'            => self::or_default( get_the_title( $post ), __( '(no title)', 'auvyx-builder' ) ),
			'isComponent'      => 'wp_block' === $post->post_type,
			'canvasUrl'        => VisualBuilder::canvas_url( $post ),
			'viewUrl'          => 'wp_block' === $post->post_type ? '' : (string) get_permalink( $post ),
			'blockEditorUrl'   => (string) get_edit_post_link( $post->ID, 'raw' ),
			'exitUrl'          => 'wp_block' === $post->post_type ? admin_url( 'admin.php?page=' . self::MENU . '-components' ) : admin_url( 'admin.php?page=' . self::MENU ),
			'designSystem'     => $this->design_system->for_studio(),
			'assetsUrl'        => AUVYX_BUILDER_URL . 'assets/placeholders',
			// The editing user's language (de_DE → de): the Studio's interface follows it where it has a translation.
			'language'         => strtolower( substr( get_user_locale(), 0, 2 ) ),
			'status'           => $post->post_status,
			'previewUrl'       => 'wp_block' === $post->post_type ? '' : (string) get_preview_post_link( $post ),
			'modified'         => $post->post_modified_gmt,
			'lock'             => self::lock( $post->ID ),
			'autosaves'        => self::autosaves( $post ),
			'playUrl'          => \Auvyx\Builder\Modules\Play\Play::url( '{key}' ),
			'autosave'         => self::pending_autosave( $post ),
			'fonts'            => self::fonts(),
			'blocks'           => $tree,
			'blockStyles'      => $block_styles,
			'edition'          => \Auvyx\Builder\Modules\Edition\Edition::studio_config(),
			'islandUrls'       => \Auvyx\Builder\Modules\Edition\Edition::island_urls(),
			'ai'               => \Auvyx\Builder\Modules\Ai\Ai::public_config(),
			'agent'            => \Auvyx\Builder\Modules\Ai\Gateway::public_config(),
			'data'             => \Auvyx\Builder\Modules\Data\Data::studio_config( $post->ID ),
			'dataSourcesAdmin' => current_user_can( 'manage_options' ),
			'canScript'        => current_user_can( 'unfiltered_html' ),
			'blockTypes'       => self::block_types(),
			'extensions'       => StudioExtensions::extensions(),
			'patterns'         => self::patterns(),
			// Templates add-ons add to both editors (Auvyx Builder Pro's, Patterns::libraries()); their markup is fetched on use.
			'templates'        => \Auvyx\Builder\Modules\Patterns\Patterns::manifest( true ),
			'theme'            => self::theme_presets(),
			'themeCss'         => self::theme_css(),
			'woocommerce'      => class_exists( 'WooCommerce' ),
			'menus'            => \Auvyx\Builder\Modules\Data\Menus::sources(),
			'canEditMenus'     => current_user_can( 'edit_theme_options' ),
			'siteTemplates'    => \Auvyx\Builder\Modules\SiteTemplates\SiteTemplates::can(),
			'shopRoutes'       => \Auvyx\Builder\Modules\SiteTemplates\SiteTemplates::shop_routes(),
			'contentTypes'     => \Auvyx\Builder\Modules\ContentTypes\ContentTypes::can(),
			'isPattern'        => 'wp_block' === $post->post_type && ! Library::synced( $post->ID ),
			// Where a page the editor makes (site templates, the agent) opens: Auvyx Editor. (The key keeps the Studio's name.)
			'studioUrl'        => current_user_can( 'publish_pages' ) || current_user_can( 'edit_pages' ) ? admin_url( 'post.php?post={id}&action=' . \Auvyx\Builder\Modules\Editor\Editor::ACTION ) : '',
			'pageTemplates'    => array_map(
				static fn( $slug, $title ) => array(
					'slug'  => (string) $slug,
					'title' => (string) $title,
				),
				array_keys( wp_get_theme()->get_page_templates( null, 'page' ) ),
				array_values( wp_get_theme()->get_page_templates( null, 'page' ) )
			),
			'themePart'        => 'wp_block' === $post->post_type ? \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::studio_config( $post ) : null,
			'convertible'      => Convert::BLOCKS,
			'pageNote'         => self::page_note( $post ),
			'designBrief'      => mb_substr( \Auvyx\Builder\Modules\DesignSystem\Brief::brief(), 0, 12000 ),
			'partLinks'        => self::part_links( $post ),
			'importMedia'      => self::import_media( (string) $post->post_content ),
			'elementorData'    => self::elementor_data( $post ),
			// Code an AI proposed through MCP without the right to script, waiting for approval (Modules/Mcp/Pending).
			'mcpPending'       => \Auvyx\Builder\Modules\Mcp\Pending::config( $post ),
			// Local preview only (a development mu-plugin supplies photos for the template placeholders).
			'previewPhotos'    => (object) apply_filters( 'auvyx_builder_preview_photos', array() ),
		);
		if ( '' !== $part ) {
			// Template part: saved through the template-parts endpoint, shown on a page that uses it (a product page
			// part on a product, previewed with that product's data) instead of the theme's part.
			$preview = Parts::preview( $post );
			if ( null !== $preview ) {
				$config['data']    = \Auvyx\Builder\Modules\Data\Data::studio_config( $preview['id'] );
				$config['preview'] = $preview;
			}
			$config = array_merge(
				$config,
				array(
					'restBase'       => 'template-parts',
					'restId'         => $part,
					'isPart'         => true,
					'partArea'       => Parts::area( $post ),
					'canvasUrl'      => Parts::canvas_url( $post ),
					'viewUrl'        => null !== $preview ? (string) get_permalink( $preview['id'] ) : ( 'catalog' === Parts::context( $post ) && function_exists( 'wc_get_page_permalink' ) ? (string) wc_get_page_permalink( 'shop' ) : home_url( '/' ) ),
					'previewUrl'     => '',
					'blockEditorUrl' => admin_url( 'site-editor.php?p=' . rawurlencode( '/wp_template_part/' . $part ) . '&canvas=edit' ),
					'exitUrl'        => admin_url( 'admin.php?page=' . self::MENU . '-parts' ),
				)
			);
		}
		// The canvas that paints what the site serves (`?canvas=web`, docs/canvas-renderer.md "WordPress"): the same page in
		// the web frame mode, the document drawn by the site (auvyx/v1/canvas/render), the islands from the plugin's assets.
		$config['webCanvasUrl'] = '' === $config['canvasUrl'] ? '' : add_query_arg(
			array(
				\Auvyx\Builder\Modules\CanvasWeb\CanvasWeb::FRAME_PARAM => 'web',
				'auvyx-as' => $is_part ? sanitize_key( Parts::area( $post ) ) : 'page',
			),
			$config['canvasUrl']
		);
		$config['canvasPrefix'] = $is_part ? sanitize_title( $post->post_name ) : 'content';
		$config['islandsUrl']   = AUVYX_BUILDER_URL . 'assets/';
		return $config;
	}

	/**
	 * A page built with Elementor keeps its layout in `_elementor_data` (a JSON array of sections, columns and widgets);
	 * its content is only the HTML Elementor rendered. That JSON, so the Studio can rebuild the page from Auvyx elements
	 * (ElementorConvert), while the content holds no blocks yet. Empty for any other page.
	 */
	private static function elementor_data( \WP_Post $post ): string {
		if ( 'page' !== $post->post_type && 'post' !== $post->post_type ) {
			return '';
		}
		if ( has_blocks( $post->post_content ) ) {
			return '';
		}
		$data = get_post_meta( $post->ID, '_elementor_data', true );
		if ( ! is_string( $data ) || '' === $data || '[' !== substr( ltrim( $data ), 0, 1 ) ) {
			return '';
		}
		return $data;
	}

	/**
	 * A Flatsome UX Builder page names its pictures by attachment id (`bg="123"`, `img="45"`): their URLs, so the
	 * Studio can rebuild the page from Auvyx blocks. Empty for any other content.
	 *
	 * @return array<string, string>
	 */
	private static function import_media( string $content ): array {
		if ( ! preg_match( '/\[(ux_[a-z_]+|section|row|col|text_box)[\s\]]/', $content ) ) {
			return array();
		}
		$urls = array();
		if ( preg_match_all( '/\b(?:bg|id|img|image)="(\d{1,10})"/', $content, $m ) ) {
			foreach ( array_unique( $m[1] ) as $id ) {
				$url = wp_get_attachment_image_url( (int) $id, 'large' );
				if ( $url ) {
					$urls[ $id ] = $url;
				}
			}
		}
		return $urls;
	}

	/**
	 * Header and footer parts open in Studio from a page's canvas (Flatsome edits its header from any page).
	 *
	 * @return array{header: string, footer: string}
	 */
	private static function part_links( \WP_Post $post ): array {
		$links = array(
			'header' => '',
			'footer' => '',
		);
		if ( ! current_user_can( 'edit_theme_options' ) ) {
			return $links;
		}
		// The parts the page's own template shows; else the ones named like their area (`header`, `footer`).
		$used     = array();
		$template = get_block_template( get_stylesheet() . '//' . ( get_page_template_slug( $post ) ? get_page_template_slug( $post ) : ( 'page' === $post->post_type ? 'page' : 'single' ) ) );
		if ( $template && preg_match_all( '/<!-- wp:template-part \{[^}]*"slug":"([a-z0-9-]+)"/', (string) $template->content, $m ) ) {
			$used = $m[1];
		}
		$parts = Parts::all();
		usort(
			$parts,
			static fn( $a, $b ) => array( ! in_array( $a->slug, $used, true ), $a->slug !== $a->area ) <=> array( ! in_array( $b->slug, $used, true ), $b->slug !== $b->area )
		);
		foreach ( $parts as $part ) {
			if ( isset( $links[ $part->area ] ) && '' === $links[ $part->area ] ) {
				$links[ $part->area ] = add_query_arg( '_wpnonce', wp_create_nonce( 'auvyx-edit-part' ), admin_url( 'admin.php?page=' . self::MENU . '-parts&part=' . rawurlencode( $part->id ) ) );
			}
		}
		return $links;
	}

	/**
	 * Font families from theme.json (theme + user + default origins): slug, name, CSS value.
	 *
	 * @return array<int, array{slug: string, name: string}>
	 */
	public static function fonts(): array {
		$families = wp_get_global_settings( array( 'typography', 'fontFamilies' ) );
		$out      = array();
		foreach ( (array) $families as $origin ) {
			$list = is_array( $origin ) && isset( $origin['slug'] ) ? array( $origin ) : (array) $origin;
			foreach ( $list as $family ) {
				if ( is_array( $family ) && isset( $family['slug'], $family['name'] ) ) {
					$out[ $family['slug'] ] = array(
						'slug' => (string) $family['slug'],
						'name' => (string) $family['name'],
					);
				}
			}
		}
		return array_values( $out );
	}

	/**
	 * post.php?post=ID&action=auvyx-studio, the deprecated Studio's address: redirects to the same document in Auvyx Editor,
	 * with the rest of the address (view, type, auvyx-conditions, auvyx-back…), so old links keep working.
	 *
	 * @deprecated 1.0.0 Use Editor::url().
	 *
	 * @param int $post_id Post ID.
	 */
	public function render( $post_id ): void {
		$post = get_post( (int) $post_id );
		if ( ! $post || ! in_array( $post->post_type, VisualBuilder::post_types(), true ) || ! current_user_can( 'edit_post', $post->ID ) ) {
			wp_die( esc_html__( 'You cannot edit this item with Auvyx.', 'auvyx-builder' ), 403 );
		}
		wp_safe_redirect( self::redirect_url( $post->ID, wp_unslash( $_GET ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- forwards the address only; nothing is written.
		exit;
	}

	/**
	 * Where an old Studio address leads: Auvyx Editor for the same document, with the address' other arguments.
	 *
	 * @param int                  $post_id Post ID.
	 * @param array<string, mixed> $query   The old address' query arguments.
	 */
	public static function redirect_url( int $post_id, array $query ): string {
		$args = array_diff_key(
			$query,
			array(
				'post'   => 1,
				'action' => 1,
			)
		);
		return add_query_arg( urlencode_deep( map_deep( $args, 'sanitize_text_field' ) ), \Auvyx\Builder\Modules\Editor\Editor::url( $post_id ) );
	}
}
