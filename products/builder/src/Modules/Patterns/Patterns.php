<?php
/**
 * Registers starter patterns from patterns/*.php. Each file returns
 * array{title: string, content: string, description?: string}.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Patterns;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Patterns implements Module {

	const CATEGORY = 'auvyx-builder';

	public function id(): string {
		return 'patterns';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_patterns' ), 20 ); // after plugins register their blocks
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	/**
	 * Template libraries: Auvyx Builder's own, then what add-ons add through `auvyx_builder_template_libraries` (Auvyx Builder
	 * Pro's, docs/editions.md). Each is a folder written by apps/studio TemplatesSuite (manifest.json and one file of block
	 * markup per template) and the URL of the assets folder its markup names.
	 *
	 * @return array<int, array{id: string, dir: string, assets: string}>
	 */
	public static function libraries(): array {
		$libraries = array(
			array(
				'id'     => 'builder',
				'dir'    => AUVYX_BUILDER_DIR . 'patterns/generated/',
				'assets' => AUVYX_BUILDER_URL . 'assets',
			),
		);
		/**
		 * Filters the template libraries. Each: `id` (lower-case letters, digits and dashes), `dir` (a folder with
		 * manifest.json and `<id>.html` per template, as apps/studio TemplatesSuite writes it) and `assets` (the URL that
		 * takes the place of the generator's asset base in the markup).
		 *
		 * @param array<int, array{id: string, dir: string, assets: string}> $libraries
		 */
		$added = apply_filters( 'auvyx_builder_template_libraries', array() );
		foreach ( is_array( $added ) ? $added : array() as $library ) {
			if ( ! is_array( $library ) || ! isset( $library['id'], $library['dir'], $library['assets'] ) ) {
				continue;
			}
			$id = sanitize_key( (string) $library['id'] );
			if ( '' === $id || 'builder' === $id || ! is_dir( (string) $library['dir'] ) ) {
				continue;
			}
			$libraries[] = array(
				'id'     => $id,
				'dir'    => trailingslashit( (string) $library['dir'] ),
				'assets' => untrailingslashit( esc_url_raw( (string) $library['assets'] ) ),
			);
		}
		return $libraries;
	}

	/**
	 * Every template of every library, without its markup (the editors' lists). A later library's id replaces an earlier one.
	 *
	 * @param bool $added_only Only the templates add-ons add (the editors bundle Auvyx Builder's own).
	 * @return array<int, array{id: string, group: string, category: string, title: string, description: string, kit: string, library: string}>
	 */
	public static function manifest( bool $added_only = false ): array {
		$out = array();
		foreach ( self::libraries() as $library ) {
			if ( $added_only && 'builder' === $library['id'] ) {
				continue;
			}
			$manifest = json_decode( (string) @file_get_contents( $library['dir'] . 'manifest.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents,WordPress.PHP.NoSilencedErrors.Discouraged -- a local file of the plugin.
			foreach ( is_array( $manifest ) ? $manifest : array() as $item ) {
				if ( ! is_array( $item ) || ! isset( $item['id'] ) || '' === sanitize_file_name( (string) $item['id'] ) ) {
					continue;
				}
				$out[ (string) $item['id'] ] = array(
					'id'          => (string) $item['id'],
					'group'       => (string) ( $item['group'] ?? 'Block' ),
					'category'    => (string) ( $item['category'] ?? '' ),
					'title'       => (string) ( $item['title'] ?? $item['id'] ),
					'description' => (string) ( $item['description'] ?? '' ),
					'kit'         => (string) ( $item['kit'] ?? 'Starter' ),
					'library'     => $library['id'],
				);
			}
		}
		return array_values( $out );
	}

	/**
	 * The markup of a template, with its library's asset addresses, or null.
	 *
	 * @param string $id Template id.
	 */
	public static function markup( string $id ): ?string {
		$id = sanitize_file_name( $id );
		if ( '' === $id ) {
			return null;
		}
		foreach ( array_reverse( self::libraries() ) as $library ) {
			$file = $library['dir'] . $id . '.html';
			if ( is_readable( $file ) ) {
				return str_replace( self::GENERATED_ASSETS, $library['assets'], (string) file_get_contents( $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local file of the plugin.
			}
		}
		return null;
	}

	/**
	 * Generated template libraries with their markup (WordPress patterns, the AI's catalog).
	 *
	 * @return array<int, array{id: string, group: string, category: string, title: string, description: string, kit: string, library: string, content: string}>
	 */
	public static function templates(): array {
		$out = array();
		foreach ( self::manifest() as $item ) {
			$content = self::markup( $item['id'] );
			if ( null !== $content ) {
				$item['content'] = $content;
				$out[]           = $item;
			}
		}
		return $out;
	}

	/** Asset base used by the template generator (apps/studio Templates.GeneratedAssets). */
	const GENERATED_ASSETS = 'https://auvyx.invalid/assets';

	/** Template groups (apps/studio Templates) → pattern categories. */
	const GROUPS = array(
		'Section' => 'auvyx-sections',
		'Block'   => 'auvyx-blocks',
		'Layout'  => 'auvyx-layout',
	);

	/**
	 * Every block a pattern uses is registered (plugin blocks in kits need their plugin, ADR 0036).
	 *
	 * @param string $content Pattern markup.
	 */
	public static function blocks_available( string $content ): bool {
		preg_match_all( '/<!-- wp:([a-z0-9-]+\/[a-z0-9-]+)/', $content, $names );
		$registry = \WP_Block_Type_Registry::get_instance();
		foreach ( array_unique( $names[1] ) as $name ) {
			if ( ! $registry->is_registered( $name ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * `GET auvyx/v1/templates/markup?ids=a,b`: the markup of templates add-ons add (Auvyx Editor bundles Auvyx Builder's own),
	 * by id: what Auvyx Editor reads (apps/editor/src/lib/templates.ts).
	 * `tree=1` answers each as the element tree of Studio::tree() instead. Deprecated: only the deprecated Auvyx Studio asked
	 * for it (host-wordpress WpHost); it keeps working for add-ons that call it.
	 */
	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			'/templates/markup',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_markup' ),
				'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
				'args'                => array(
					'ids'  => array(
						'type'              => 'string',
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
					// Deprecated (the Studio's form; Auvyx Editor reads markup).
					'tree' => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Ids (empty: every added template) and the format.
	 */
	public function rest_markup( \WP_REST_Request $request ): \WP_REST_Response {
		$added  = wp_list_pluck( self::manifest( true ), 'id' );
		$wanted = array_filter( array_map( 'trim', explode( ',', (string) $request['ids'] ) ) );
		$ids    = $wanted ? array_values( array_intersect( $added, $wanted ) ) : $added;
		$out    = array();
		foreach ( $ids as $id ) {
			$markup = self::markup( $id );
			if ( null !== $markup ) {
				$out[ $id ] = $request['tree'] ? \Auvyx\Builder\Modules\Studio\Studio::tree( parse_blocks( $markup ) ) : $markup;
			}
		}
		return new \WP_REST_Response( (object) $out );
	}

	public function register_patterns(): void {
		register_block_pattern_category( self::CATEGORY, array( 'label' => __( 'Auvyx Builder', 'auvyx-builder' ) ) );
		register_block_pattern_category( 'auvyx-sections', array( 'label' => __( 'Auvyx Sections', 'auvyx-builder' ) ) );
		register_block_pattern_category( 'auvyx-blocks', array( 'label' => __( 'Auvyx Blocks', 'auvyx-builder' ) ) );
		register_block_pattern_category( 'auvyx-layout', array( 'label' => __( 'Auvyx Rows & layout', 'auvyx-builder' ) ) );

		foreach ( self::templates() as $template ) {
			if ( ! self::blocks_available( $template['content'] ) ) {
				continue; // A store section without Auvyx Woo, for example.
			}
			register_block_pattern(
				'auvyx-builder/' . $template['id'],
				array(
					'title'       => $template['title'],
					'description' => $template['description'],
					'content'     => $template['content'],
					'categories'  => array( self::GROUPS[ $template['group'] ] ?? 'auvyx-blocks' ),
					'keywords'    => array( $template['category'] ),
				)
			);
		}

		$files = glob( AUVYX_BUILDER_DIR . 'patterns/*.php' );
		foreach ( false === $files ? array() : $files as $file ) {
			$pattern = require $file;
			register_block_pattern(
				'auvyx-builder/' . basename( $file, '.php' ),
				array(
					'title'       => $pattern['title'],
					'description' => $pattern['description'] ?? '',
					'content'     => $pattern['content'],
					'categories'  => array( self::CATEGORY ),
				)
			);
		}
	}
}
