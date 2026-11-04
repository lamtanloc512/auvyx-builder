<?php
/**
 * A site template's demo products (its `catalog`), made as real WooCommerce products. A catalog is an Auvyx Cloud pack, its
 * photos on Auvyx Cloud, or a file in a folder a theme or add-on adds with the `auvyx_builder_demo_catalog_dirs` filter (a port's
 * child theme), its photos files beside it. Photos are copied into this site's Media Library. No other remote catalog or
 * arbitrary URL is accepted. Auvyx Builder ships no catalogs of its own.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\DemoCatalog;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class DemoCatalog implements Module {

	const ORIGIN       = '_auvyx_demo_catalog';
	const IMAGE_SOURCE = '_auvyx_demo_image_source';
	const CLOUD        = 'https://yb-cloud.auvyx.org';
	const PACK_LIMIT   = 2097152;
	const FILE_LIMIT   = 8388608;
	const REVALIDATE   = 300;
	const TERM_OWNER   = '_auvyx_demo_catalog_created';

	public function id(): string {
		return 'demo-catalog';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
		add_filter( 'woocommerce_product_get_description', array( $this, 'photo_credits' ), 10, 2 );
	}

	/** Public attribution follows the locally stored photo, not a remote hotlink or an admin-only record. */
	public function photo_credits( string $description, $product ): string {
		if ( ! $product->get_meta( self::ORIGIN ) ) {
			return $description;
		}
		$lines = array();
		foreach ( array_merge( array( $product->get_image_id() ), $product->get_gallery_image_ids() ) as $image_id ) {
			$image = get_post( $image_id );
			if ( $image && get_post_meta( $image_id, self::IMAGE_SOURCE, true ) && $image->post_content ) {
				$lines[] = '<li>' . esc_html( $image->post_content ) . '</li>';
			}
		}
		return $lines ? $description . '<details class="auvyx-demo-photo-credits"><summary>' . esc_html__( 'Photo credits', 'auvyx-builder' ) . '</summary><ul>' . implode( '', $lines ) . '</ul></details>' : $description;
	}

	public static function can(): bool {
		return current_user_can( 'edit_theme_options' ) && current_user_can( 'edit_products' ) && current_user_can( 'publish_products' ) && current_user_can( 'upload_files' );
	}

	/** Removal is destructive: capability plus a valid REST nonce, even for non-cookie clients. */
	public static function can_remove( $request ): bool {
		$nonce = sanitize_text_field( (string) $request->get_header( 'X-WP-Nonce' ) );
		return self::can() && current_user_can( 'delete_products' ) && false !== wp_verify_nonce( $nonce, 'wp_rest' );
	}

	/** Pinned Auvyx Cloud host. Filterable (staging, tests) but only to https. */
	public static function cloud_base(): string {
		$base = untrailingslashit( (string) apply_filters( 'auvyx_builder_demo_cloud_base', self::CLOUD ) );
		return 0 === strpos( $base, 'https://' ) ? $base : self::CLOUD;
	}

	public function routes(): void {
		$id = '(?P<id>[a-z0-9][a-z0-9-]{0,63})';
		register_rest_route(
			'auvyx/v1',
			'/demo-catalogs/' . $id,
			array(
				'methods'             => 'GET',
				'permission_callback' => static fn() => current_user_can( 'edit_theme_options' ),
				'callback'            => static function ( $request ) {
					$catalog = self::catalog( (string) $request['id'] );
					if ( ! $catalog ) {
						return new \WP_REST_Response( array( 'keys' => array() ) );
					}
					if ( ! class_exists( 'WC_Product_Simple' ) ) {
						return new \WP_Error( 'auvyx_demo_woocommerce', __( 'Activate WooCommerce to import this demo\'s products.', 'auvyx-builder' ), array( 'status' => 409 ) );
					}
					if ( ! self::can() ) {
						return new \WP_Error( 'auvyx_demo_permission', __( 'You cannot import products and images on this site.', 'auvyx-builder' ), array( 'status' => 403 ) );
					}
					return new \WP_REST_Response( array( 'keys' => array_column( $catalog['products'], 'key' ) ) );
				},
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/demo-catalogs/' . $id . '/remove',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( self::class, 'can_remove' ),
				'callback'            => static function ( $request ) {
					$result = self::remove( (string) $request['id'] );
					return is_wp_error( $result ) ? $result : new \WP_REST_Response( $result );
				},
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/demo-catalogs/' . $id . '/(?P<key>[a-z0-9][a-z0-9-]{0,63})',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( self::class, 'can' ),
				'callback'            => static function ( $request ) {
					$result = self::import( (string) $request['id'], (string) $request['key'] );
					return is_wp_error( $result ) ? $result : new \WP_REST_Response( $result );
				},
			)
		);
	}

	/** Structural check of a pack before it is trusted: schema, id, bounded product and file lists. */
	private static function valid( $catalog, string $id, bool $remote ): bool {
		if ( ! is_array( $catalog ) || ! isset( $catalog['products'] ) || ! is_array( $catalog['products'] ) || count( $catalog['products'] ) > 200 ) {
			return false;
		}
		if ( ! $remote ) {
			return true;
		}
		$same = ( $catalog['id'] ?? '' ) === $id;
		return 'auvyx-demo-catalog/2' === ( $catalog['schema'] ?? '' ) && $same && isset( $catalog['files'] ) && is_array( $catalog['files'] ) && count( $catalog['files'] ) <= 400;
	}

	/** One conditional request to the pinned cloud. Returns the verified pack, or null on any failure. */
	private static function fetch( string $id, $cached ): ?array {
		$headers = array();
		if ( is_array( $cached ) && ! empty( $cached['etag'] ) ) {
			$headers['If-None-Match'] = $cached['etag'];
		}
		$response = wp_remote_get(
			self::cloud_base() . '/v1/demo/catalogs/' . rawurlencode( $id ),
			array(
				'timeout'             => 5,
				'redirection'         => 0,
				'reject_unsafe_urls'  => true,
				'limit_response_size' => self::PACK_LIMIT,
				'headers'             => $headers,
			)
		);
		if ( is_wp_error( $response ) ) {
			return null;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( 304 === $code && is_array( $cached ) && isset( $cached['catalog'] ) ) {
			return array(
				'catalog' => $cached['catalog'],
				'etag'    => (string) $cached['etag'],
			);
		}
		$body = (string) wp_remote_retrieve_body( $response );
		$etag = (string) wp_remote_retrieve_header( $response, 'etag' );
		if ( 200 !== $code || strlen( $body ) > self::PACK_LIMIT || ! hash_equals( '"' . hash( 'sha256', $body ) . '"', $etag ) ) {
			return null;
		}
		$catalog = json_decode( $body, true );
		return self::valid( $catalog, $id, true ) ? array(
			'catalog' => $catalog,
			'etag'    => $etag,
		) : null;
	}

	/**
	 * Folders of local catalogs (`<id>.json`, its photos in the same folder), added by themes and add-ons.
	 *
	 * @return string[]
	 */
	public static function dirs(): array {
		/**
		 * Folders of demo catalogs a site template can name (`<id>.json`; photos by paths relative to the folder).
		 *
		 * @param string[] $dirs
		 */
		$dirs = (array) apply_filters( 'auvyx_builder_demo_catalog_dirs', array() );
		return array_values( array_filter( array_map( static fn( $dir ) => untrailingslashit( (string) $dir ), $dirs ), static fn( $dir ) => '' !== $dir && is_dir( $dir ) ) );
	}

	/** A catalog file from the first folder that has one, with the folder it came from (`_auvyx_dir`, where its photos are). */
	private static function local( string $id ): array {
		foreach ( self::dirs() as $dir ) {
			$file = $dir . '/' . $id . '.json';
			if ( ! is_readable( $file ) ) {
				continue;
			}
			$catalog = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			if ( self::valid( $catalog, $id, false ) ) {
				$catalog['id']         = $id;
				$catalog['_auvyx_dir'] = $dir;
				return $catalog;
			}
		}
		return array();
	}

	/** A local catalog (from a folder of `dirs()`) first, else the pinned cloud pack, cached by its strong ETag. */
	public static function catalog( string $id ): array {
		if ( 1 !== preg_match( '/^[a-z0-9][a-z0-9-]{0,63}$/', $id ) ) {
			return array();
		}
		$local = self::local( $id );
		if ( $local ) {
			return $local;
		}
		$remote = self::remote( $id );
		unset( $remote['_auvyx_dir'] ); // only a folder of dirs() says where photos are on disk
		return $remote;
	}

	private static function remote( string $id ): array {
		$key    = 'auvyx_demo_pack_' . $id;
		$miss   = 'auvyx_demo_pack_miss_' . $id;
		$cached = get_transient( $key );
		$usable = is_array( $cached ) && isset( $cached['catalog'], $cached['checked'] );
		if ( $usable && time() - (int) $cached['checked'] < self::REVALIDATE ) {
			return $cached['catalog'];
		}
		// A failed or unknown pack is not retried on every product of the same import.
		if ( false === get_transient( $miss ) ) {
			$pack = self::fetch( $id, $cached );
			if ( $pack ) {
				set_transient(
					$key,
					array(
						'catalog' => $pack['catalog'],
						'etag'    => $pack['etag'],
						'checked' => time(),
					),
					12 * HOUR_IN_SECONDS
				);
				return $pack['catalog'];
			}
			set_transient( $miss, 1, 60 );
		}
		return $usable ? $cached['catalog'] : array();
	}

	/** Existing product type must match the pack row before WooCommerce loads it as a class. */
	private static function type_of( int $existing, bool $variable ): string {
		$type = $variable ? 'variable' : 'simple';
		if ( $existing ) {
			$current = wc_get_product( $existing );
			if ( $current && $current->get_type() !== $type ) {
				wp_set_object_terms( $existing, $type, 'product_type' );
			}
		}
		return $type;
	}

	/** Valid variants only: every option names a defined attribute and value, no duplicate combination. */
	private static function variants( array $row, array $catalog ): array {
		$defs = array();
		foreach ( $catalog['attributes'] ?? array() as $definition ) {
			$name = (string) ( $definition['key'] ?? '' );
			if ( sanitize_key( $name ) !== $name || '' === $name ) {
				continue;
			}
			foreach ( $definition['values'] ?? array() as $value ) {
				$defs[ $name ][ (string) ( $value['key'] ?? '' ) ] = true;
			}
		}
		$order = array_keys( $defs );
		$valid = array();
		$seen  = array();
		foreach ( array_slice( (array) ( $row['variants'] ?? array() ), 0, 100 ) as $variant ) {
			$options = isset( $variant['options'] ) && is_array( $variant['options'] ) ? $variant['options'] : array();
			if ( ! $options ) {
				continue;
			}
			$ordered = array();
			foreach ( $order as $name ) {
				if ( isset( $options[ $name ] ) ) {
					$ordered[ $name ] = (string) $options[ $name ];
				}
			}
			$ok = count( $ordered ) === count( $options );
			foreach ( $ordered as $name => $value ) {
				$ok = $ok && isset( $defs[ $name ][ $value ] ) && sanitize_title( $value ) !== '';
			}
			$signature = wp_json_encode( $ordered );
			if ( $ok && ! isset( $seen[ $signature ] ) ) {
				$seen[ $signature ] = true;
				$variant['options'] = $ordered;
				$valid[]            = $variant;
			}
		}
		return $valid;
	}

	private static function category_ids( string $id, array $catalog, array $row ) {
		$by_key = array();
		foreach ( $catalog['categories'] ?? array() as $definition ) {
			if ( isset( $definition['key'] ) ) {
				$by_key[ $definition['key'] ] = $definition;
			}
		}
		$ids = array();
		foreach ( (array) ( $row['categories'] ?? array() ) as $ref ) {
			$ref        = (string) $ref;
			$definition = $by_key[ $ref ] ?? array( 'name' => $ref );
			$parent     = 0;
			if ( ! empty( $definition['parent'] ) && isset( $by_key[ $definition['parent'] ] ) ) {
				$parent = self::category( $id, (string) $by_key[ $definition['parent'] ]['name'], 0 );
				if ( is_wp_error( $parent ) ) {
					return $parent;
				}
			}
			$term = self::category( $id, (string) ( $definition['name'] ?? $ref ), (int) $parent );
			if ( is_wp_error( $term ) ) {
				return $term;
			}
			$ids[] = $term;
		}
		return $ids;
	}

	private static function category( string $id, string $name, int $parent_id ) {
		$name  = sanitize_text_field( $name );
		$found = term_exists( $name, 'product_cat', $parent_id );
		if ( $found ) {
			return (int) ( is_array( $found ) ? $found['term_id'] : $found );
		}
		$inserted = wp_insert_term( $name, 'product_cat', array( 'parent' => $parent_id ) );
		if ( is_wp_error( $inserted ) ) {
			return $inserted;
		}
		update_term_meta( (int) $inserted['term_id'], self::TERM_OWNER, $id );
		return (int) $inserted['term_id'];
	}

	/** One product per request, making retries cheap and avoiding a long-running batch. */
	public static function import( string $id, string $key, bool $refresh_demo = false ) {
		if ( ! class_exists( 'WC_Product_Simple' ) ) {
			return new \WP_Error( 'auvyx_demo_woocommerce', 'WooCommerce is not active.', array( 'status' => 409 ) );
		}
		$catalog = self::catalog( $id );
		$rows    = array_values( array_filter( $catalog['products'] ?? array(), static fn( $row ) => ( $row['key'] ?? '' ) === $key ) );
		if ( ! $rows ) {
			return new \WP_Error( 'auvyx_demo_product', 'No such demo product.', array( 'status' => 404 ) );
		}
		$row      = $rows[0];
		$sku      = 'auvyx-demo-' . $id . '-' . $key;
		$existing = wc_get_product_id_by_sku( $sku );
		if ( $existing ) {
			if ( get_post_meta( $existing, self::ORIGIN, true ) !== $id ) {
				return new \WP_Error( 'auvyx_demo_sku', 'This SKU already belongs to another product.', array( 'status' => 409 ) );
			}
			if ( ! $refresh_demo ) {
				return array(
					'id'      => $existing,
					'name'    => get_the_title( $existing ),
					'created' => false,
				);
			}
		}
		$variants = self::variants( $row, $catalog );
		if ( ! empty( $row['variants'] ) && ! $variants ) {
			return new \WP_Error( 'auvyx_demo_variants', 'This demo product has no valid variants.', array( 'status' => 400 ) );
		}

		// Download everything before publishing a product: a failed image never leaves a blank card.
		$images = array();
		foreach ( $row['media'] ?? $row['images'] ?? array() as $photo ) {
			$photo = isset( $photo['src'] ) ? array(
				'path'   => $photo['src'],
				'credit' => '',
			) + $photo : $photo;
			$image = self::image( $photo, (string) $row['name'], $catalog );
			if ( is_wp_error( $image ) ) {
				return $image;
			}
			$images[] = $image;
		}
		if ( ! $images ) {
			return new \WP_Error( 'auvyx_demo_image_url', 'This demo product has no photo.', array( 'status' => 400 ) );
		}
		$variant_images = array();
		foreach ( $variants as $index => $variant ) {
			$variant_images[ $index ] = 0;
			foreach ( (array) ( $variant['media'] ?? array() ) as $path ) {
				$image = self::image(
					array(
						'path'   => (string) $path,
						'credit' => '',
					),
					(string) $row['name'],
					$catalog
				);
				if ( is_wp_error( $image ) ) {
					return $image;
				}
				$variant_images[ $index ] = $image;
				break;
			}
		}
		$categories = self::category_ids( $id, $catalog, $row );
		if ( is_wp_error( $categories ) ) {
			return $categories;
		}
		try {
			$variable = (bool) $variants;
			$type     = self::type_of( (int) $existing, $variable );
			$product  = $variable ? new \WC_Product_Variable( $existing ) : new \WC_Product_Simple( $existing );
			$position = (int) array_search( $key, array_column( $catalog['products'], 'key' ), true );
			$sale     = $row['salePrice'] ?? $row['sale'] ?? null;
			$product->set_menu_order( $position );
			// The curated first product also leads date-sorted demo loops, regardless of download timing.
			$product->set_date_created( time() - $position * HOUR_IN_SECONDS );
			$product->set_name( sanitize_text_field( $row['name'] ) );
			$product->set_sku( $sku );
			$product->set_slug( sanitize_title( $key ) );
			$product->set_status( 'publish' );
			$product->set_catalog_visibility( 'visible' );
			$product->set_description( wp_kses_post( wpautop( (string) ( $row['description'] ?? '' ) ) ) );
			$product->set_short_description( wp_kses_post( (string) ( $row['excerpt'] ?? '' ) ) );
			$product->set_virtual( ! empty( $row['virtual'] ) );
			$product->set_featured( ! empty( $row['featured'] ) );
			$product->set_category_ids( $categories );
			$product->set_image_id( $images[0] );
			$product->set_gallery_image_ids( array_slice( $images, 1 ) );
			$product->set_manage_stock( ! $variable );
			if ( ! $variable ) {
				$product->set_regular_price( wc_format_decimal( $row['price'] ) );
				$product->set_sale_price( null !== $sale ? wc_format_decimal( $sale ) : '' );
				$product->set_stock_quantity( (int) ( $row['stock'] ?? 0 ) );
				$product->set_stock_status( ! empty( $row['stock'] ) ? 'instock' : 'outofstock' );
			}
			$attributes = array();
			$defaults   = array();
			$term_sets  = array();
			if ( $variable ) {
				$used = array();
				foreach ( $variants as $variant ) {
					foreach ( $variant['options'] as $attr_key => $value_key ) {
						$used[ $attr_key ][ $value_key ] = true;
					}
				}
				foreach ( $catalog['attributes'] ?? array() as $definition ) {
					$attr_key = (string) ( $definition['key'] ?? '' );
					if ( empty( $used[ $attr_key ] ) ) {
						continue;
					}
					$attribute_id = self::global_attribute( $id, $definition );
					if ( is_wp_error( $attribute_id ) ) {
						return $attribute_id;
					}
					$taxonomy = wc_attribute_taxonomy_name( $attr_key );
					$term_ids = array();
					foreach ( $definition['values'] ?? array() as $value ) {
						if ( ! isset( $used[ $attr_key ][ (string) ( $value['key'] ?? '' ) ] ) ) {
							continue;
						}
						$term = self::attribute_term( $id, $definition, $value, $taxonomy );
						if ( is_wp_error( $term ) ) {
							return $term;
						}
						$term_ids[] = (int) $term->term_id;
					}
					$attribute = new \WC_Product_Attribute();
					$attribute->set_id( (int) $attribute_id );
					$attribute->set_name( $taxonomy );
					$attribute->set_options( $term_ids );
					$attribute->set_position( count( $attributes ) );
					$attribute->set_visible( true );
					$attribute->set_variation( true );
					$attributes[]           = $attribute;
					$term_sets[ $taxonomy ] = $term_ids;
					$defaults[ $taxonomy ]  = sanitize_title( (string) $variants[0]['options'][ $attr_key ] );
				}
			}
			$product->set_attributes( $attributes );
			$product->set_default_attributes( $defaults );
			$product->update_meta_data( self::ORIGIN, $id );
			$product->update_meta_data( '_auvyx_subtitle', sanitize_text_field( (string) ( $row['excerpt'] ?? '' ) ) );
			$product_id = $product->save();
			foreach ( $term_sets as $taxonomy => $term_ids ) {
				wp_set_object_terms( $product_id, $term_ids, $taxonomy );
			}
			if ( $variable ) {
				$keep = array();
				foreach ( $variants as $index => $variant_data ) {
					$attrs = array();
					foreach ( $variant_data['options'] as $attr_key => $value_key ) {
						$attrs[ wc_attribute_taxonomy_name( $attr_key ) ] = sanitize_title( $value_key );
					}
					$variation_sku = $sku . '-' . implode( '-', array_map( 'sanitize_title', array_values( $variant_data['options'] ) ) );
					$variation_id  = wc_get_product_id_by_sku( $variation_sku );
					if ( $variation_id && get_post_meta( $variation_id, self::ORIGIN, true ) !== $id ) {
						return new \WP_Error( 'auvyx_demo_sku', 'Variation SKU belongs to another product.', array( 'status' => 409 ) );
					}
					$variation = new \WC_Product_Variation( $variation_id ? $variation_id : 0 );
					$own_price = isset( $variant_data['price'] );
					$variation->set_parent_id( $product_id );
					$variation->set_attributes( $attrs );
					$variation->set_sku( $variation_sku );
					$variation->set_status( 'publish' );
					$variation->set_regular_price( wc_format_decimal( $own_price ? $variant_data['price'] : $row['price'] ) );
					$variation->set_sale_price( ! $own_price && null !== $sale ? wc_format_decimal( $sale ) : '' );
					$variation->set_manage_stock( true );
					$variation->set_stock_quantity( max( 0, (int) ( $variant_data['stock'] ?? 0 ) ) );
					$variation->set_stock_status( ! empty( $variant_data['stock'] ) ? 'instock' : 'outofstock' );
					$variation->set_image_id( (int) $variant_images[ $index ] );
					$variation->update_meta_data( self::ORIGIN, $id );
					$keep[] = $variation->save();
				}
				foreach ( $product->get_children() as $child_id ) {
					if ( ! in_array( $child_id, $keep, true ) && get_post_meta( $child_id, self::ORIGIN, true ) === $id ) {
						wp_delete_post( $child_id, true );
					}
				}
				\WC_Product_Variable::sync( $product_id );
				wc_delete_product_transients( $product_id );
			}
			foreach ( $categories as $term_id ) {
				if ( get_term_meta( $term_id, self::TERM_OWNER, true ) === $id && ! get_term_meta( $term_id, 'thumbnail_id', true ) ) {
					update_term_meta( $term_id, 'thumbnail_id', $images[0] );
				}
			}
			return array(
				'id'      => $product_id,
				'name'    => $product->get_name(),
				'created' => ! $existing,
				'type'    => $type,
			);
		} catch ( \Exception $e ) {
			return new \WP_Error( 'auvyx_demo_import', $e->getMessage(), array( 'status' => 500 ) );
		}
	}

	/** Term slug = value key, name = label. Terms and swatch meta are marked only when this import created them. */
	private static function attribute_term( string $id, array $definition, array $value, string $taxonomy ) {
		$slug = sanitize_title( (string) ( $value['key'] ?? '' ) );
		$term = get_term_by( 'slug', $slug, $taxonomy );
		if ( ! $term ) {
			$inserted = wp_insert_term( sanitize_text_field( (string) ( $value['label'] ?? $slug ) ), $taxonomy, array( 'slug' => $slug ) );
			if ( is_wp_error( $inserted ) ) {
				return $inserted;
			}
			$term = get_term( (int) $inserted['term_id'], $taxonomy );
			update_term_meta( $term->term_id, self::TERM_OWNER, $id );
		}
		$meta = self::swatch( 'META_COLOR', 'auvyx_swatch_color' );
		if ( 'color' === ( $definition['kind'] ?? '' ) && ! empty( $value['swatch'] ) && ! get_term_meta( $term->term_id, $meta, true ) ) {
			$hex = sanitize_hex_color( (string) $value['swatch'] );
			if ( $hex ) {
				update_term_meta( $term->term_id, $meta, $hex );
			}
		}
		return $term;
	}

	/** Reads Auvyx Woo's constants when that add-on is loaded; the values are its stored contract either way. */
	private static function swatch( string $constant, string $fallback ): string {
		return defined( '\Auvyx\Woo\Swatches::' . $constant ) ? (string) constant( '\Auvyx\Woo\Swatches::' . $constant ) : $fallback;
	}

	private static function image( array $photo, string $name, array $catalog = array() ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		if ( isset( $catalog['_auvyx_dir'] ) ) {
			return self::local_image( (string) ( $photo['path'] ?? '' ), $photo, $name, $catalog );
		}
		$path = ltrim( (string) ( $photo['path'] ?? '' ), '/' );
		if ( '' === $path && ! empty( $photo['url'] ) ) {
			$path = basename( (string) $photo['url'] );
		}
		if ( 1 !== preg_match( '~^(?:[a-z0-9-]+/)*[a-z0-9][a-z0-9-]*\.(?:webp|jpg|png|svg)$~', $path ) || ! isset( $catalog['files'][ $path ]['sha256'], $catalog['files'][ $path ]['bytes'] ) ) {
			return new \WP_Error( 'auvyx_demo_image_url', 'Untrusted demo image URL.', array( 'status' => 400 ) );
		}
		$expected = $catalog['files'][ $path ];
		if ( (int) $expected['bytes'] > self::FILE_LIMIT ) {
			return new \WP_Error( 'auvyx_demo_media_hash', 'Demo media is too large.', array( 'status' => 400 ) );
		}
		$url   = self::cloud_base() . '/demo-products/' . rawurlencode( (string) ( $catalog['id'] ?? '' ) ) . '/' . implode( '/', array_map( 'rawurlencode', explode( '/', $path ) ) );
		$found = get_posts(
			array(
				'post_type'   => 'attachment',
				'post_status' => 'inherit',
				'numberposts' => 1,
				'fields'      => 'ids',
				'meta_key'    => self::IMAGE_SOURCE,
				'meta_value'  => $url,
			)
		); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key,WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		if ( $found && wp_get_attachment_url( $found[0] ) && hash_equals( (string) $expected['sha256'], (string) get_post_meta( $found[0], '_auvyx_demo_media_sha256', true ) ) ) {
			return (int) $found[0];
		}
		$temp = download_url( $url, 20 );
		if ( is_wp_error( $temp ) ) {
			return $temp;
		}
		if ( filesize( $temp ) !== (int) $expected['bytes'] || ! hash_equals( (string) $expected['sha256'], hash_file( 'sha256', $temp ) ) ) {
			wp_delete_file( $temp );
			return new \WP_Error( 'auvyx_demo_media_hash', 'Demo media integrity check failed.', array( 'status' => 400 ) );
		}
		$image = media_handle_sideload(
			array(
				'name'     => sanitize_file_name( basename( $path ) ),
				'tmp_name' => $temp,
			),
			0,
			sanitize_text_field( $name )
		);
		if ( is_wp_error( $image ) ) {
			wp_delete_file( $temp );
			return $image;
		}
		update_post_meta( $image, self::IMAGE_SOURCE, $url );
		update_post_meta( $image, self::TERM_OWNER, (string) ( $catalog['id'] ?? '' ) );
		update_post_meta( $image, '_auvyx_demo_media_sha256', (string) $expected['sha256'] );
		update_post_meta( $image, '_wp_attachment_image_alt', sanitize_text_field( $name ) );
		// Attribution stays with the local attachment, including the source and derivative license.
		wp_update_post(
			array(
				'ID'           => $image,
				'post_content' => sanitize_text_field( $photo['credit'] ?? '' ),
				'post_excerpt' => sanitize_text_field( $photo['credit'] ?? '' ),
			)
		);
		return (int) $image;
	}

	/** A photo of a local catalog: a file under the catalog's folder, by a relative path (no `..`, no URL), copied into the Media Library. */
	private static function local_image( string $path, array $photo, string $name, array $catalog ) {
		$root = realpath( (string) $catalog['_auvyx_dir'] );
		$file = 1 === preg_match( '~^(?:[a-z0-9_-]+/)*[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:webp|jpe?g|png|gif)$~i', $path ) && $root ? realpath( $root . '/' . $path ) : false;
		if ( ! $file || 0 !== strpos( $file, $root . DIRECTORY_SEPARATOR ) || ! is_file( $file ) ) {
			return new \WP_Error( 'auvyx_demo_image_url', 'This catalog names a photo it does not have.', array( 'status' => 400 ) );
		}
		if ( filesize( $file ) > self::FILE_LIMIT ) {
			return new \WP_Error( 'auvyx_demo_media_hash', 'Demo media is too large.', array( 'status' => 400 ) );
		}
		$source = 'local:' . (string) $catalog['id'] . '/' . $path;
		$sha256 = (string) hash_file( 'sha256', $file );
		$found  = get_posts(
			array(
				'post_type'   => 'attachment',
				'post_status' => 'inherit',
				'numberposts' => 1,
				'fields'      => 'ids',
				'meta_key'    => self::IMAGE_SOURCE,
				'meta_value'  => $source,
			)
		); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key,WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		if ( $found && wp_get_attachment_url( $found[0] ) && hash_equals( $sha256, (string) get_post_meta( $found[0], '_auvyx_demo_media_sha256', true ) ) ) {
			return (int) $found[0];
		}
		// media_handle_sideload moves the file it is given: hand it a copy.
		$temp = wp_tempnam( basename( $path ) );
		if ( ! $temp || ! copy( $file, $temp ) ) {
			return new \WP_Error( 'auvyx_demo_media_copy', 'Could not copy a demo photo.', array( 'status' => 500 ) );
		}
		$image = media_handle_sideload(
			array(
				'name'     => sanitize_file_name( basename( $path ) ),
				'tmp_name' => $temp,
			),
			0,
			sanitize_text_field( $name )
		);
		if ( is_wp_error( $image ) ) {
			wp_delete_file( $temp );
			return $image;
		}
		update_post_meta( $image, self::IMAGE_SOURCE, $source );
		update_post_meta( $image, self::TERM_OWNER, (string) $catalog['id'] );
		update_post_meta( $image, '_auvyx_demo_media_sha256', $sha256 );
		update_post_meta( $image, '_wp_attachment_image_alt', sanitize_text_field( $name ) );
		wp_update_post(
			array(
				'ID'           => $image,
				'post_content' => sanitize_text_field( $photo['credit'] ?? '' ),
				'post_excerpt' => sanitize_text_field( $photo['credit'] ?? '' ),
			)
		);
		return (int) $image;
	}

	private static function global_attribute( string $catalog_id, array $definition ) {
		$name = (string) ( $definition['key'] ?? '' );
		if ( '' === $name || sanitize_key( $name ) !== $name || ! function_exists( 'wc_create_attribute' ) ) {
			return new \WP_Error( 'auvyx_demo_attribute', 'Invalid product attribute.', array( 'status' => 400 ) );
		}
		$id = wc_attribute_taxonomy_id_by_name( $name );
		if ( ! $id ) {
			$id = wc_create_attribute(
				array(
					'name'         => sanitize_text_field( (string) ( $definition['label'] ?? $name ) ),
					'slug'         => $name,
					'type'         => 'select',
					'order_by'     => 'menu_order',
					'has_archives' => false,
				)
			);
			if ( is_wp_error( $id ) ) {
				return $id;
			}
			update_option(
				'auvyx_demo_attribute_' . $name,
				array(
					'id'      => (int) $id,
					'catalog' => $catalog_id,
				),
				false
			);
		}
		$taxonomy = wc_attribute_taxonomy_name( $name );
		if ( ! taxonomy_exists( $taxonomy ) ) {
			register_taxonomy(
				$taxonomy,
				array( 'product' ),
				array(
					'hierarchical' => false,
					'show_ui'      => false,
					'query_var'    => true,
					'rewrite'      => false,
					'public'       => false,
				)
			);
		}
		$option = self::swatch( 'TYPES', 'auvyx_woo_attribute_types' );
		$types  = get_option( $option, array() );
		$types  = is_array( $types ) ? $types : array();
		if ( ! isset( $types[ $name ] ) ) {
			$types[ $name ] = 'color' === ( $definition['kind'] ?? '' ) ? 'color' : 'button';
			update_option( $option, $types );
			update_option( 'auvyx_demo_attribute_type_' . $name, $catalog_id, false );
		}
		return (int) $id;
	}

	/** True while anything outside the import still points at this attachment. */
	private static function referenced( int $attachment_id ): bool {
		global $wpdb;
		$value = (string) $attachment_id;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		if ( $wpdb->get_var( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_thumbnail_id' AND meta_value = %s LIMIT 1", $value ) ) ) {
			return true;
		}
		if ( $wpdb->get_var( $wpdb->prepare( "SELECT term_id FROM {$wpdb->termmeta} WHERE meta_key = 'thumbnail_id' AND meta_value = %s LIMIT 1", $value ) ) ) {
			return true;
		}
		$galleries = $wpdb->get_col( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_product_image_gallery' AND meta_value LIKE %s", '%' . $wpdb->esc_like( $value ) . '%' ) );
		// phpcs:enable WordPress.DB.DirectDatabaseQuery
		foreach ( $galleries as $gallery ) {
			if ( in_array( $value, explode( ',', (string) $gallery ), true ) ) {
				return true;
			}
		}
		return false;
	}

	/** Deletes only what this import created and nothing else still uses. Pre-existing items are never touched. */
	public static function remove( string $id ) {
		if ( 1 !== preg_match( '/^[a-z0-9][a-z0-9-]{0,63}$/', $id ) || ! class_exists( 'WC_Product_Simple' ) ) {
			return new \WP_Error( 'auvyx_demo_woocommerce', 'WooCommerce is not active.', array( 'status' => 409 ) );
		}
		$owned   = get_posts(
			array(
				'post_type'   => 'product',
				'post_status' => 'any',
				'numberposts' => -1,
				'fields'      => 'ids',
				'meta_key'    => self::ORIGIN,
				'meta_value'  => $id,
			)
		); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key,WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		$deleted = 0;
		foreach ( $owned as $product_id ) {
			$product = wc_get_product( $product_id );
			if ( ! $product ) {
				continue;
			}
			foreach ( $product->get_children() as $child_id ) {
				if ( get_post_meta( $child_id, self::ORIGIN, true ) === $id ) {
					wp_delete_post( $child_id, true );
				}
			}
			$product->delete( true );
			++$deleted;
		}
		$taxonomies = array_merge( array( 'product_cat' ), wc_get_attribute_taxonomy_names() );
		foreach ( $taxonomies as $taxonomy ) {
			$terms = get_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => false,
					'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
						array(
							'key'   => self::TERM_OWNER,
							'value' => $id,
						),
					),
				)
			);
			foreach ( is_wp_error( $terms ) ? array() : $terms as $term ) {
				$objects = get_objects_in_term( $term->term_id, $taxonomy );
				if ( ! is_wp_error( $objects ) && ! $objects && ! get_term_children( $term->term_id, $taxonomy ) ) {
					wp_delete_term( $term->term_id, $taxonomy );
				}
			}
		}
		$option_types = self::swatch( 'TYPES', 'auvyx_woo_attribute_types' );
		foreach ( wc_get_attribute_taxonomies() as $attribute ) {
			$marker = get_option( 'auvyx_demo_attribute_' . $attribute->attribute_name );
			if ( ! is_array( $marker ) || ( $marker['catalog'] ?? '' ) !== $id || (int) $marker['id'] !== (int) $attribute->attribute_id ) {
				continue;
			}
			$taxonomy = wc_attribute_taxonomy_name( $attribute->attribute_name );
			$left     = taxonomy_exists( $taxonomy ) ? get_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => false,
					'fields'     => 'ids',
				)
			) : array();
			if ( $left ) {
				continue;
			}
			wc_delete_attribute( (int) $attribute->attribute_id );
			delete_option( 'auvyx_demo_attribute_' . $attribute->attribute_name );
			if ( get_option( 'auvyx_demo_attribute_type_' . $attribute->attribute_name ) === $id ) {
				$types = get_option( $option_types, array() );
				if ( is_array( $types ) ) {
					unset( $types[ $attribute->attribute_name ] );
					update_option( $option_types, $types );
				}
				delete_option( 'auvyx_demo_attribute_type_' . $attribute->attribute_name );
			}
		}
		$attachments = get_posts(
			array(
				'post_type'   => 'attachment',
				'post_status' => 'inherit',
				'numberposts' => -1,
				'fields'      => 'ids',
				'meta_key'    => self::TERM_OWNER,
				'meta_value'  => $id,
			)
		); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key,WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		$media       = 0;
		foreach ( $attachments as $attachment_id ) {
			if ( ! self::referenced( (int) $attachment_id ) && wp_delete_attachment( $attachment_id, true ) ) {
				++$media;
			}
		}
		return array(
			'removed' => $deleted,
			'media'   => $media,
		);
	}
}
