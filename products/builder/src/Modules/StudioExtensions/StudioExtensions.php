<?php
/**
 * DEPRECATED with Auvyx Studio (see Modules/Studio): Auvyx Editor does not read these extensions, and nothing loads the
 * `auvyx_studio_scripts` scripts any more. The filters stay so add-ons that use them keep working without errors.
 *
 * What themes and plugins add to Auvyx Studio's Add panel (docs/studio.md "Extending"), with no change to the builder:
 * - every dynamic block they register appears on its own, in its block category (Studio::block_types());
 * - the filters `auvyx_studio_elements`, `auvyx_studio_categories` and `auvyx_studio_template_sources` add elements, groups and
 *   template folders, cleaned to plain data (ids, labels, URLs, registered block names) in the Studio's config;
 * - `auvyx_studio_scripts` adds scripts that call `window.auvyxStudioApi` in the browser before the Studio starts.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\StudioExtensions;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

/**
 * @deprecated 1.0.0 The Auvyx Studio editor is deprecated; Auvyx Editor does not read Studio extensions.
 */
final class StudioExtensions implements Module {

	public function id(): string {
		return 'studio-extensions';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		// Read by Studio::config(): nothing to hook.
	}

	/** An id: lower-case letters, digits, `-`, `_`, `:` and `/` (a block name), 80 at most. */
	private static function ext_id( $value ): string {
		$value = is_string( $value ) ? strtolower( $value ) : '';
		return 1 === preg_match( '#^[a-z0-9][a-z0-9:/_-]{0,79}$#', $value ) ? $value : '';
	}

	/** An icon: one of the panel's names, or an image URL. */
	private static function ext_icon( $value ): string {
		if ( ! is_string( $value ) || '' === $value ) {
			return '';
		}
		return 1 === preg_match( '/^[a-z][a-z0-9-]{0,30}$/', $value ) ? $value : esc_url_raw( $value, array( 'http', 'https' ) );
	}

	/**
	 * Elements, groups and template sources themes and plugins add, cleaned: what the editor receives is plain data
	 * (ids, labels, URLs, registered block names), never markup or code.
	 *
	 * @return array{elements: array<int, array<string, mixed>>, categories: array<int, array<string, mixed>>, templateSources: array<int, array<string, mixed>>}
	 */
	public static function extensions(): array {
		/**
		 * Elements for the Studio's Add panel. Each: `id`, `title`, `category` (layout, basic, general, media, site,
		 * commerce, theme, widgets or your own), `icon` (a panel icon name or an image URL), `keywords`, and one of
		 * `block` (a registered block name, rendered by the site), `json` (URL of a Studio document) or `template`
		 * (`source` and `id` of a template source).
		 *
		 * @param array<int, array<string, mixed>> $elements Elements.
		 */
		$elements = array();
		foreach ( (array) apply_filters( 'auvyx_studio_elements', array() ) as $e ) {
			if ( ! is_array( $e ) ) {
				continue;
			}
			$id    = self::ext_id( $e['id'] ?? '' );
			$title = sanitize_text_field( (string) ( $e['title'] ?? '' ) );
			if ( '' === $id || '' === $title ) {
				continue;
			}
			$insert = null;
			if ( isset( $e['block'] ) && is_string( $e['block'] ) && \WP_Block_Type_Registry::get_instance()->is_registered( $e['block'] ) ) {
				$insert = array( 'block' => $e['block'] );
			} elseif ( isset( $e['json'] ) && is_string( $e['json'] ) && '' !== esc_url_raw( $e['json'], array( 'http', 'https' ) ) ) {
				$insert = array( 'json' => esc_url_raw( $e['json'], array( 'http', 'https' ) ) );
			} elseif ( isset( $e['template']['source'], $e['template']['id'] ) && '' !== self::ext_id( $e['template']['source'] ) && '' !== self::ext_id( $e['template']['id'] ) ) {
				$insert = array(
					'template' => array(
						'source' => self::ext_id( $e['template']['source'] ),
						'id'     => self::ext_id( $e['template']['id'] ),
					),
				);
			}
			if ( null === $insert ) {
				continue;
			}
			$elements[] = array(
				'id'       => $id,
				'title'    => mb_substr( $title, 0, 60 ),
				'category' => sanitize_key( (string) ( $e['category'] ?? 'general' ) ),
				'icon'     => self::ext_icon( $e['icon'] ?? '' ),
				'keywords' => array_slice( array_values( array_filter( array_map( 'sanitize_text_field', array_map( 'strval', (array) ( $e['keywords'] ?? array() ) ) ) ) ), 0, 12 ),
				'insert'   => $insert,
			);
		}

		/**
		 * Groups of the Studio's Add panel: `id`, `title`, `order` (built-in groups are 10 to 80).
		 *
		 * @param array<int, array<string, mixed>> $categories Groups.
		 */
		$categories = array();
		foreach ( (array) apply_filters( 'auvyx_studio_categories', array() ) as $c ) {
			if ( is_array( $c ) && '' !== sanitize_key( (string) ( $c['id'] ?? '' ) ) ) {
				$categories[] = array(
					'id'    => sanitize_key( (string) $c['id'] ),
					'title' => mb_substr( sanitize_text_field( (string) ( $c['title'] ?? $c['id'] ) ), 0, 40 ),
					'order' => isset( $c['order'] ) && is_numeric( $c['order'] ) ? (int) $c['order'] : 100,
				);
			}
		}

		/**
		 * Template sources (a theme's sections and pages): `id`, `label`, `base` (URL of a folder with index.json and
		 * one Studio document per template), optional `generatedBase` and `assets` (an assets URL its files name, and
		 * where those files are).
		 *
		 * @param array<int, array<string, mixed>> $sources Template sources.
		 */
		$sources = array();
		foreach ( (array) apply_filters( 'auvyx_studio_template_sources', array() ) as $s ) {
			if ( ! is_array( $s ) || '' === self::ext_id( $s['id'] ?? '' ) || '' === esc_url_raw( (string) ( $s['base'] ?? '' ), array( 'http', 'https' ) ) ) {
				continue;
			}
			$sources[] = array_filter(
				array(
					'id'            => self::ext_id( $s['id'] ),
					'label'         => mb_substr( sanitize_text_field( (string) ( $s['label'] ?? $s['id'] ) ), 0, 40 ),
					'base'          => untrailingslashit( esc_url_raw( (string) $s['base'], array( 'http', 'https' ) ) ),
					'generatedBase' => isset( $s['generatedBase'] ) ? esc_url_raw( (string) $s['generatedBase'], array( 'http', 'https' ) ) : '',
					'assets'        => isset( $s['assets'] ) ? esc_url_raw( (string) $s['assets'], array( 'http', 'https' ) ) : '',
				)
			);
		}
		return array(
			'elements'        => $elements,
			'categories'      => $categories,
			'templateSources' => $sources,
		);
	}

	/**
	 * Scripts themes and plugins load into Auvyx Studio (they call `window.auvyxStudioApi`): URLs only.
	 *
	 * @return string[]
	 */
	public static function scripts( \WP_Post $post ): array {
		/**
		 * Script URLs loaded into Auvyx Studio before the editor starts. A script pushes to `window.auvyxStudioApi.elements`
		 * (or `categories`, `templateSources`), or calls `window.auvyxStudioApi.registerElement()` after the
		 * `auvyx-studio-v2:ready` event.
		 *
		 * @param string[] $urls Script URLs.
		 * @param \WP_Post $post The post being edited.
		 */
		$urls = (array) apply_filters( 'auvyx_studio_scripts', array(), $post );
		return array_values( array_filter( array_map( static fn( $u ) => esc_url_raw( (string) $u, array( 'http', 'https' ) ), $urls ) ) );
	}
}
